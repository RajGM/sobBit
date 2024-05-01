require('dotenv').config()

const botKey = process.env.BOTKEY;
const { Client} = require('pg');

const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_TOKEN = botKey;  // Store your token in .env file
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const initialMessage = "Welcome! This bot can send and receive sats via Blink. Here are the available commands:\n\n" + 
"/start or /help - Show all available commands \n\n" + 
"/addAPI - Adds a new API_Key for your Blink account or replaces it if it already exists\n" +
"/balance - Shows the balances in your Blink wallet\n" +
"/createInvoice - Creates an invoice for USD or sats\n" + 
"/pay uuid - Pay the invoice using the invoiceID";

// PostgreSQL connection setup
const dbClient = new Client({
  user: 'postgres', // default superuser
  host: 'localhost', // Docker forwards this to your container
  database: 'postgres', // default database
  password: 'mysecretpassword', // the password you specified
  port: 5432, // the port you forwarded
});

dbClient.connect();

const redis = require('redis');
const client = redis.createClient({
    url: 'redis://localhost:6379'  // Adjust the URL if your Redis server is not on localhost
});
client.connect();

const { v4: uuidv4 } = require('uuid');

bot.onText(/\/start/, async (msg) => {

  const chatId = msg.chat.id;
  const helpMessage = initialMessage;
  bot.sendMessage(chatId, helpMessage);

});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = initialMessage;
  bot.sendMessage(chatId, helpMessage);

});

bot.onText(/\/addAPI/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id; // Telegram user ID

  try {
      // Check if the telegram_id already exists in the users table
      const userExistsResult = await dbClient.query(
          'SELECT COUNT(*) FROM users WHERE telegram_id = $1',
          [userId]
      );

      const userExists = userExistsResult.rows[0].count > 0;

      if (!userExists) {
          // If the user does not exist, insert a new record
          await dbClient.query(
              'INSERT INTO users (telegram_id) VALUES ($1)',
              [userId]
          );

          // Set Redis state for input and send welcome message
          await client.setEx(`chat:${chatId}:state`, 180, 'awaiting_input'); // Expires after 3 minutes
          bot.sendMessage(chatId, "Welcome! Please enter your Blink API Key.");
      } else {
          // If the user already exists, do nothing
          await client.setEx(`chat:${chatId}:state`, 180, 'awaiting_input'); // Expires after 3 minutes
          bot.sendMessage(chatId, "Welcome! Please enter your new Blink API Key to replace the existing one.");
      }
  } catch (err) {
      console.error('Database query error', err.stack);
      bot.sendMessage(userId, "Error accessing your data. Please try again later.");
  }
});

bot.onText(/\/balance/, async (msg) => {
  const userId = msg.from.id; // Telegram user ID

  try {
      // Retrieve Blink API key from the database based on the Telegram user ID
      const dbResult = await dbClient.query(
          'SELECT api_keys FROM users WHERE telegram_id = $1',
          [userId]
      );

      if (dbResult.rows.length > 0) {
          // Blink API key found in the database
          const blinkKey = dbResult.rows[0].api_keys;

          // Fetch balance via Blink API
          const userData = await fetchUserData(blinkKey);
          let balanceArray = {};

          // Iterate over wallet data and store balances in the balanceArray
          for (const wallet of userData.me.defaultAccount.wallets) {
              if (wallet.walletCurrency === 'BTC') {
                  balanceArray.BTC = wallet.balance;
              } else if (wallet.walletCurrency === 'USD') {
                  balanceArray.USD = wallet.balance;
              }
          }

          // Construct message content based on the balanceArray
          let message = "Your balances:\n";
          if (balanceArray.BTC !== undefined) {
              message += `BTC Wallet: ${balanceArray.BTC} sats\n`;
          }
          if (balanceArray.USD !== undefined) {
              message += `USD Wallet: ${balanceArray.USD} cents\n`;
          }

          // Send balance message to user
          bot.sendMessage(msg.chat.id, message);
      } else {
          // Blink API key not found in the database
          bot.sendMessage(msg.chat.id, "Blink API key not found. Please use /addAPI command to save your Blink API key.");
      }
  } catch (error) {
      // Error handling
      console.error('Failed to retrieve balance:', error);
      bot.sendMessage(msg.chat.id, "Failed to retrieve balance. Please try again.");
  }
});

bot.onText(/\/createInvoice/, async (msg) => { 

  const chatId = msg.chat.id;
  const userId = msg.from.id; // Telegram user ID

  try {
      // Check if the telegram_id already exists in the users table
      const userExistsResult = await dbClient.query(
          'SELECT COUNT(*) FROM users WHERE telegram_id = $1',
          [userId]
      );

      const userExists = userExistsResult.rows[0].count > 0;

      if (!userExists) {
          // If the user does not exist, insert a new record
          bot.sendMessage(chatId, "Welcome! Blink API Key doesn't exists, Please add one Check /help.");
      } else {

        await client.setEx(`chat:${chatId}:state`, 180, 'wallet_amount'); // Expires after 3 minutes
        bot.sendMessage(chatId, "Please enter the walletType and amount in the format: wallet_Type(BTC or USD) amount(123)");
      }
  } catch (err) {
      console.error('Database query error', err.stack);
      bot.sendMessage(userId, "Error accessing your data. Please try again later.");
  }

});

bot.onText(/\/pay (\S+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id; // Telegram user ID
  const invoiceUID = match[1]; // The UUID extracted from the command

  const dbResult = await dbClient.query(
     'SELECT * FROM users WHERE telegram_id = $1',
     [userId]
 );

 const userExists = dbResult.rows.length > 0;

 if(userExists){
   const apiKey = dbResult.rows[0].api_keys;
   const uidResult = await dbClient.query(
     'SELECT * FROM invoices WHERE invoice_uuid = $1',
     [invoiceUID]
 );
 const walletType = uidResult.rows[0].wallet_type;
 const walletId = walletType === 'BTC' ? dbResult.rows[0].walletid_btc : dbResult.rows[0].walletid_usd;
   const paymentRequest = findPaymentRequest(JSON.parse(uidResult.rows[0]));


   if (paymentRequest !== null) {
     // Assuming sendInvoicePayment is a function that sends the payment request
     await sendInvoicePayment(apiKey, paymentRequest, walletId);
 
     // Assuming bot is your Telegram bot instance
     bot.sendMessage(chatId, 'Payment Done for invoice: ' + invoiceUID);
     
 } else {
     // Handle the case where no payment request is found
     console.error('No payment request found for invoice:', invoiceUID);
     await bot.sendMessage(callbackQuery.message.chat.id, 'No payment request found for this invoice.');
 }

 }else{
   const chatId = callbackQuery.message.chat.id;
   bot.sendMessage(chatId, 'No API Key found. Please add your API key to generate invoices.');
 }

  /*
  try {
      // Check if the user exists in the database
      const userResult = await dbClient.query(
          'SELECT api_key FROM users WHERE telegram_id = $1',
          [userId]
      );

      if (userResult.rows.length === 0) {
          // No user found with that Telegram ID
          bot.sendMessage(chatId, "Your account is not registered or API key is missing. Please register and set up your API key with /setup.");
      } else {
          const apiKey = userResult.rows[0].api_key;

          // Assuming `processPayment` is a function that handles the payment logic
          const paymentResult = await processPayment(apiKey, uuid);
          if (paymentResult.success) {
              bot.sendMessage(chatId, `Payment successful! Transaction ID: ${paymentResult.transactionId}`);
          } else {
              bot.sendMessage(chatId, `Payment failed: ${paymentResult.message}`);
          }
      }
  } catch (err) {
      console.error('Error processing payment:', err);
      bot.sendMessage(chatId, "There was an error processing your payment. Please try again later.");
  }
*/

});

bot.on('message', async (msg) => {

  const chatId = msg.chat.id;
  const state = await client.get(`chat:${chatId}:state`);
  const userId = msg.from.id;

  if (state === 'awaiting_input') {
      const apiKey = msg.text;
      const userId = msg.from.id; // Telegram user ID

      try {
        // Fetch user data from the GraphQL API
        const userData = await fetchUserData(apiKey);

        printObject(userData, "");

        // Prepare parameters for the database query
        const params = [apiKey];
        let updateQuery = `UPDATE users SET api_keys = $1`;

        // Iterate over wallet data and add conditional updates to the query
        for (const wallet of userData.me.defaultAccount.wallets) {
            if (wallet.walletCurrency === 'BTC') {
                params.push(wallet.id); // Add BTC wallet ID to params
                updateQuery += `, walletid_btc = $${params.length}`;
            } else if (wallet.walletCurrency === 'USD') {
                params.push(wallet.id); // Add USD wallet ID to params
                updateQuery += `, walletid_usd = $${params.length}`;
            }
        }

        // Add condition to update only if the telegram_id matches
        params.push(userId);
        updateQuery += ` WHERE telegram_id = $${params.length}`;

        //Execute the single database query
        await dbClient.query(updateQuery, params);

        // Clear Redis state and data
        await client.del(`chat:${chatId}:state`, `chat:${chatId}:data`);

        bot.sendMessage(chatId, "API key and wallet IDs stored successfully.");
    } catch (error) {
        console.error('Error storing API key and wallet IDs:', error);
        bot.sendMessage(chatId, "An error occurred while storing the API key and wallet IDs.");
    }

  }

  if(state === 'wallet_amount') {
    // Create and send the invoice pack
    console.log("Message Txt:", msg.text)

    const validFormat = msg.text.trim().match(/^(\S+)\s+(\d+)$/i);

    console.log("Valid format:", validFormat);

    if(!validFormat) {
        bot.sendMessage(chatId, "Invalid input format. Please start invoice generation again with /createInvoice.");
        return; // Exit the function to prevent further execution
    }

    try {
        const walletType = validFormat[1];
        const amountStr = validFormat[2];
        const amount = parseInt(amountStr, 10);  // Convert string to integer

        const dbResult = await dbClient.query(
            'SELECT * FROM users WHERE telegram_id = $1',
            [userId]
        );

        if (dbResult.rows.length === 0) {
            throw new Error("User not found.");
        }

        // Determine the correct wallet ID based on the wallet type
        const walletId = walletType === 'BTC' ? dbResult.rows[0].walletid_btc : dbResult.rows[0].walletid_usd;

        // Fetch the API key and attempt to create an invoice
        const apiKey = dbResult.rows[0].api_keys;
        const getInvoice = await createInvoiceOnBehalfOfRecipient(apiKey, walletType, walletId, amount);
        const invoiceJSON = JSON.stringify(getInvoice)

        const UUID = uuidv4();
        const query = 'INSERT INTO invoices (invoice_data, invoice_uuid, wallet_type) VALUES ($1, $2, $3)';
        await dbClient.query(query, [invoiceJSON, UUID, walletType]);

        sendInvoiceDetailsToUser(chatId, UUID, amount, walletType);
       
    } catch (error) {
        console.error("Error during invoice creation process:", error);
        bot.sendMessage(chatId, `Failed to create invoice due to an ${error}. Please try again.`);
    }
}

});

bot.on('callback_query', async (callbackQuery) => {
  console.log("Inside CallBACK query")
  
  //const chatId =  callbackQuery.inline_message_id?callbackQuery.inline_message_id : callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const action = data.split('_')[0];  // Get the action part
  const invoiceUID = data.split('_')[1];  // Get the UID part, present in all cases now

  console.log("InvoiceID: ", invoiceUID)

  if(callbackQuery.inline_message_id){

    switch (action) {
      case 'PAY':
       const userId = callbackQuery.from.id; 
       const dbResult = await dbClient.query(
          'SELECT * FROM users WHERE telegram_id = $1',
          [userId]
      );

      const userExists = dbResult.rows.length > 0;

      if(userExists){
        const apiKey = dbResult.rows[0].api_keys;
        const uidResult = await dbClient.query(
          'SELECT * FROM invoices WHERE invoice_uuid = $1',
          [invoiceUID]
      );
      const walletType = uidResult.rows[0].wallet_type;
      const walletId = walletType === 'BTC' ? dbResult.rows[0].walletid_btc : dbResult.rows[0].walletid_usd;
        const paymentRequest = findPaymentRequest(JSON.parse(uidResult.rows[0]));


        if (paymentRequest !== null) {
          // Assuming sendInvoicePayment is a function that sends the payment request
          await sendInvoicePayment(apiKey, paymentRequest, walletId);
      
          // Assuming bot is your Telegram bot instance
          await bot.editMessageText(`Action ${action} for invoice ${invoiceUID} processed`, {
              inline_message_id: callbackQuery.inline_message_id
          });
      } else {
          // Handle the case where no payment request is found
          console.error('No payment request found for invoice:', invoiceUID);
          await bot.sendMessage(callbackQuery.message.chat.id, 'No payment request found for this invoice.');
      }

      }else{
        const chatId = callbackQuery.message.chat.id;
        bot.sendMessage(chatId, 'No API Key found. Please add your API key to generate invoices.');
      }

        break;
      default:
        console.log('Unknown inline action');
        break;
    }

  } 
  
  if(callbackQuery.message && callbackQuery.message.chat.id){ 

    const chatId = callbackQuery.message.chat.id;

    switch (action) {
      case 'PAY':
          // Handle payment
          // do the same processing here as done in the inline query
          const userId = callbackQuery.from.id; 
       const dbResult = await dbClient.query(
          'SELECT * FROM users WHERE telegram_id = $1',
          [userId]
      );

      const userExists = dbResult.rows.length > 0;

      if(userExists){
        const apiKey = dbResult.rows[0].api_keys;
        const uidResult = await dbClient.query(
          'SELECT * FROM invoices WHERE invoice_uuid = $1',
          [invoiceUID]
      );
      const walletType = uidResult.rows[0].wallet_type;
      const walletId = walletType === 'BTC' ? dbResult.rows[0].walletid_btc : dbResult.rows[0].walletid_usd;
        const paymentRequest = findPaymentRequest(JSON.parse(uidResult.rows[0]));


        if (paymentRequest !== null) {
          // Assuming sendInvoicePayment is a function that sends the payment request
          await sendInvoicePayment(apiKey, paymentRequest, walletId);
      
          // Assuming bot is your Telegram bot instance
          bot.sendMessage(chatId, 'Payment Done for invoice: ' + invoiceUID);
          
      } else {
          // Handle the case where no payment request is found
          console.error('No payment request found for invoice:', invoiceUID);
          await bot.sendMessage(callbackQuery.message.chat.id, 'No payment request found for this invoice.');
      }

      }else{
        const chatId = callbackQuery.message.chat.id;
        bot.sendMessage(chatId, 'No API Key found. Please add your API key to generate invoices.');
      }

          break;
      default:
          // Handle unknown button click
          bot.sendMessage(chatId, 'Unknown option clicked, please try again.');
          break;
  }

  }

});

bot.on('inline_query', async (query) => {
  console.log("Inline QUERY");
  const queryText = query.query.trim().toLowerCase();
  const userId = query.from.id;  
  console.log("QUERY TEXT:", queryText);
  const results = [];

  if (queryText.startsWith("pay")) {
    const uuid = queryText.split(" ")[1];  // Assuming the format is "pay UUID"
    if (uuid) {
      // Create an article result with payment details
      results.push({
        type: 'article',
        id: uuid,
        title: 'Confirm Payment',
        input_message_content: {
          message_text: `🔹 **Confirm Your Payment**\n\n*Invoice ID:* \`${uuid}\`\n\n`,
          parse_mode: 'Markdown'
        },
        reply_markup: {
          inline_keyboard: [[
              { text: "Pay Now", callback_data: `PAY_${uuid}` }
          ]]
      },
        description: `Tap to send and confirm payment for Invoice ID ${uuid}`  // Adding a description for clarity
      });
    } else {
      // Handle the case where UUID might be missing or incorrectly formatted
      console.error("No UUID found after 'pay' keyword.");
    }
  } else if (queryText.startsWith("generateinvoice")) {
    const args = queryText.split(" ");
    if (args.length >= 3) {
      const walletType = args[1].toUpperCase();
      const amountStr = args[2];
      const amount = parseInt(amountStr, 10);

      const dbResult = await dbClient.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [userId]
    );

    console.log("dbResult:",dbResult)

    const userExists = dbResult.rows.length > 0;
      // Assuming checkApiKey function to check if the user has an API key associated
      if (userExists) {
        console.log(dbResult.rows[0])
        // Fetch the API key and attempt to create an invoice
        const apiKey = dbResult.rows[0].api_keys;
        const walletId = walletType === 'BTC' ? dbResult.rows[0].walletid_btc : dbResult.rows[0].walletid_usd;
        console.log("API Key:", apiKey, "walletType:", walletType ,"Wallet ID:", walletId, "Amount:", amount)
        const getInvoice = await createInvoiceOnBehalfOfRecipient(apiKey, walletType, walletId, amount);
        const invoiceJSON = JSON.stringify(getInvoice)

        const UUID = uuidv4();
        const query = 'INSERT INTO invoices (invoice_data, invoice_uuid, wallet_type) VALUES ($1, $2, $3)';
        const currencyType = walletType == "BTC" ? "Sats" : "Cents";
        await dbClient.query(query, [invoiceJSON, UUID, walletType]).then(() => {

          results.push({
            type: 'article',
            id: UUID, // Assume generateInvoice returns an object with a uuid
            title: 'Invoice Generated',
            input_message_content: {
              message_text: `🔹 **Invoice Generated**\n\n*Invoice ID:* \`${UUID}\`\n*Amount:* \`${amount} ${currencyType}\`\n\nPlease confirm to proceed with the payment.`,
              parse_mode: 'Markdown'
            },
            reply_markup: {
              inline_keyboard: [[
                  { text: "Confirm", callback_data: `PAY_${UUID}` }
              ]]
          },
            description: `Invoice for ${amount} ${walletType} ready. Tap to confirm and send.`
          });

        });
      
      } else {
        results.push({
          type: 'article',
          id: 'no-api-key',
          title: 'No API Key Found',
          input_message_content: {
            message_text: `🚫 **No API Key Found**\n\nPlease configure your API key to generate invoices.`,
            parse_mode: 'Markdown'
          },
          description: `No API Key found. Please add your API key to generate invoices.`
        });
      }
    }
  } else {
    console.log("Query does not match expected commands.");
  }

  bot.answerInlineQuery(query.id, results).catch(error => {
    console.error("Failed to answer inline query:", error);
  });
});

async function fetchUserData(blinkKey) {
  const url = 'https://api.blink.sv/graphql';
  const headers = {
      'Content-Type': 'application/json',
      'X-API-KEY': blinkKey
  };
  const body = JSON.stringify({
      query: `query Me {
          me {
              defaultAccount {
                  wallets {
                      id
                      walletCurrency
                      balance
                  }
              }
          }
      }`,
      variables: {}
  });

  try {
      const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: body
      });

      const data = await response.json();
      return data.data; // Return user data
  } catch (error) {
      console.error('Error making the request:', error);
      throw error;
  }
}

function printObject(obj, indent) {
  for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          console.log(`${indent}${key}:`);
          if (value !== null && typeof value === 'object') {
              printObject(value, indent + '  ');
          } else {
              console.log(`${indent}  ${value}`);
          }
      }
  }
}

async function createInvoiceOnBehalfOfRecipient(apiKey, currency, recipientWalletId, amount) {
    const url = 'https://api.blink.sv/graphql';
    const headers = {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
    };

    // Define the GraphQL queries for BTC and USD invoices
    const queryBTC = `
        mutation LnInvoiceCreateOnBehalfOfRecipient($input: LnInvoiceCreateOnBehalfOfRecipientInput!) {
            lnInvoiceCreateOnBehalfOfRecipient(input: $input) {
                invoice {
                    paymentRequest
                    paymentHash
                    paymentSecret
                    satoshis
                }
                errors {
                    message
                }
            }
        }
    `;

    const queryUSD = `
        mutation LnUsdInvoiceCreateOnBehalfOfRecipient($input: LnUsdInvoiceCreateOnBehalfOfRecipientInput!) {
            lnUsdInvoiceCreateOnBehalfOfRecipient(input: $input) {
                invoice {
                    paymentRequest
                    paymentHash
                    paymentSecret
                    satoshis
                }
                errors {
                    message
                }
            }
        }
    `;

    // Choose the correct query based on the currency
    
    const query = currency === 'BTC' ? queryBTC : queryUSD;

    const variables = {
        input: {
            amount: amount,  // The amount for the invoice
            recipientWalletId: recipientWalletId  // The recipient's wallet ID
        }
    };

    const graphqlData = {
        query: query,
        variables: variables
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(graphqlData)
        });

        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(`HTTP error, status = ${response.status}, details = ${JSON.stringify(responseData)}`);
        }

        // Check for GraphQL errors and handle them
        if (responseData.errors && responseData.errors.length > 0) {
            throw new Error(`GraphQL error: ${responseData.errors.map(err => err.message).join(', ')}`);
        }

        if (responseData.data && responseData.data.lnInvoiceCreateOnBehalfOfRecipient && responseData.data.lnInvoiceCreateOnBehalfOfRecipient.errors.length > 0) {
            throw new Error(`Invoice creation error: ${responseData.data.lnInvoiceCreateOnBehalfOfRecipient.errors.map(err => err.message).join(', ')}`);
        }

        if (responseData.data && responseData.data.LnUsdInvoiceCreateOnBehalfOfRecipient && responseData.data.LnUsdInvoiceCreateOnBehalfOfRecipient.errors.length > 0) {
          throw new Error(`Invoice creation error: ${responseData.data.LnUsdInvoiceCreateOnBehalfOfRecipient.errors.map(err => err.message).join(', ')}`);
        }

        console.log('Invoice Creation Result:', responseData.data);
        return responseData.data; // Return the data for further processing or confirmation
    } catch (error) {
        console.error('Error creating invoice:', error.message);
        throw error; // Rethrow the error after logging
    }
}

async function sendInvoicePayment(apiKey, paymentRequest, walletId) {
    const url = 'https://api.blink.sv/graphql';
    const headers = {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey  // Ensure to replace '<YOUR_AUTH_TOKEN_HERE>' with your actual API key
    };

    const query = `
        mutation LnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
          lnInvoicePaymentSend(input: $input) {
            status
            errors {
              message
              path
              code
            }
          }
        }
    `;

    const variables = {
        input: {
            paymentRequest: paymentRequest,  // The actual payment request string
            walletId: walletId              // The wallet ID from which the payment should be made
        }
    };

    const graphqlData = {
        query: query,
        variables: variables
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(graphqlData)
        });

        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(`HTTP error, status = ${response.status}, message = ${JSON.stringify(responseData)}`);
        }

        console.log('Payment Status:', responseData.data.lnInvoicePaymentSend);
    } catch (error) {
        console.error('Error sending payment:', error);
    }
}

function sendInvoiceDetailsToUser(chatId, invoiceUID, amount, walletType) {
  const currencyType = walletType == "BTC" ? "Sats" : "Cents";
  const detailsMessage = `*Pay the invoice for amount:* ${amount} ${currencyType}\n*Use this code for payment:* \`${invoiceUID}\``;
  
  bot.sendMessage(chatId, detailsMessage, {
      parse_mode: 'Markdown'
  });
}

function findPaymentRequest(obj) {

  // If not, check if the current value is an object and search within it recursively
  for (const key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
          const result = findPaymentRequest(obj[key]);
          if (result !== null) {
              return result;  // Return the found paymentRequest
          }
      }
  }

  return null;  // Return null if no paymentRequest is found
}