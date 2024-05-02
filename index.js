require('dotenv').config()

const botKey = process.env.BOTKEY;
const { Client} = require('pg');

const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_TOKEN = botKey;  // Store your token in .env file
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const initialMessage = "Welcome! This bot can send and receive sats via Blink. Here are the available commands:\n\n" + 
"/start or /help - Show all available commands \n\n" + 
"/addAPI apiKey - Add or replace existing Blink APIKey \n" +
"/balance - Shows the balances in your Blink wallet\n" +
"/createInvoice walletType amount - Creates an invoice \n" + 
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

bot.onText(/\/addAPI (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id; // Telegram user ID
  const apiKey = match[1]; 

  try {
      // Check if the telegram_id already exists in the users table
      const dbResult = await dbClient.query(
        'SELECT api_keys FROM users WHERE telegram_id = $1',
        [userId]
    );

      if(dbResult.rows.length>0){
        //update

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
        console.log("Insert Query:", updateQuery, "Params:", params)

        // Execute the single database query
        await dbClient.query(updateQuery, params);

        bot.sendMessage(chatId, "API key and wallet IDs updated successfully.");

      }else{
        //insert 
        const userData = await fetchUserData(apiKey);

        printObject(userData, "");
        
        // Prepare parameters for the database query
        const params = [apiKey];
        let insertQuery = `INSERT INTO users (api_keys, walletid_btc, walletid_usd, telegram_id) VALUES ($1`;
        
        // Iterate over wallet data and add conditional updates to the query
        for (const wallet of userData.me.defaultAccount.wallets) {
            if (wallet.walletCurrency === 'BTC') {
                params.push(wallet.id); // Add BTC wallet ID to params
                insertQuery += `, $${params.length}`;
            } else if (wallet.walletCurrency === 'USD') {
                params.push(wallet.id); // Add USD wallet ID to params
                insertQuery += `, $${params.length}`;
            }
        }
        // Add the telegram_id to params
        params.push(userId);
        insertQuery += `, $${params.length})`;
        console.log("Insert Query:", insertQuery, "Params:", params)
        // Execute the single database query
        await dbClient.query(insertQuery, params);
        
        bot.sendMessage(chatId, "API key and wallet IDs stored successfully.");
        
      }
      
  } catch (err) {
      console.error('Database query error', err.stack);
      bot.sendMessage(chatId, "Error accessing your data. Please try again later.");
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

bot.onText(/\/createInvoice (\S+)\s+(\d+)$/i, async (msg, match) => { 

  const chatId = msg.chat.id;
  const userId = msg.from.id; // Telegram user ID
  const walletType = match[1].toUpperCase(); // Extract wallet type directly from command
  const amountStr = match[2];
  const amount = parseInt(amountStr, 10); // Convert string to integer

  try {
    // Check if the telegram_id already exists in the users table
    const userResult = await dbClient.query(
        'SELECT api_keys, walletid_btc, walletid_usd FROM users WHERE telegram_id = $1',
        [userId]
    );

    if (userResult.rows.length === 0) {
        // If the user does not exist, prompt them to register
        bot.sendMessage(chatId, "Blink API Key doesn't exist. Please add one. Check /help.");
        return;
    }

    // Determine the correct wallet ID based on the wallet type
    const walletId = walletType === 'BTC' ? userResult.rows[0].walletid_btc : userResult.rows[0].walletid_usd;

    // Fetch the API key and attempt to create an invoice
    const apiKey = userResult.rows[0].api_keys;
    const invoiceResponse = await createInvoiceOnBehalfOfRecipient(apiKey, walletType, walletId, amount);

    if (invoiceResponse==null) {
      console.log("inside failed invoice null")
        bot.sendMessage(chatId, "Failed to create invoice. Please try again.");
        return;
    }

    const invoiceJSON = JSON.stringify(invoiceResponse);
    const UUID = uuidv4();
    const query = 'INSERT INTO invoices (invoice_data, invoice_uuid) VALUES ($1, $2)';
    await dbClient.query(query, [invoiceJSON, UUID]);

    const currencyType = walletType == "BTC" ? "Sats" : "Cents";
  const detailsMessage = `*Pay the invoice for amount:* ${amount} ${currencyType}\n*Use this code for payment:* \`${UUID}\``;
  
  bot.sendMessage(chatId, detailsMessage, {
      parse_mode: 'Markdown'
  });

} catch (error) {
    console.error('Error during invoice creation process', error);
    bot.sendMessage(chatId, "Error accessing your data. Please try again later.");
}

});

bot.onText(/\/pay (\S+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id; // Telegram user ID
  const invoiceUID = match[1]; // The UUID extracted from the command

  try {
      // Check if the user exists in the database
      const userResult = await dbClient.query(
          'SELECT * FROM users WHERE telegram_id = $1',
          [userId]
      );

      if (userResult.rows.length === 0) {
          bot.sendMessage(chatId, "No API Key found. Please add your API key to generate invoices.");
          return;
      }

      // Check if the invoice exists and retrieve it
      const invoiceResult = await dbClient.query(
          'SELECT * FROM invoices WHERE invoice_uuid = $1',
          [invoiceUID]
      );

      if (invoiceResult.rows.length === 0) {
          bot.sendMessage(chatId, "No invoice found with ID: " + invoiceUID);
          return;
      }

      // Extract invoice and payment details
      const invoice = invoiceResult.rows[0];
      const walletType = invoice.wallet_type; // Assumes wallet_type column exists
      const walletId = walletType === 'BTC' ? userResult.rows[0].walletid_btc : userResult.rows[0].walletid_usd;
      const paymentRequest = findPaymentRequest(JSON.parse(invoice.invoice_data)); // Assumes invoice_data contains payment request info

      if (!paymentRequest) {
          bot.sendMessage(chatId, "No payment request found for this invoice.");
          return;
      }

      // Send the payment request
      const apiKey = userResult.rows[0].api_keys;
      await sendInvoicePayment(apiKey, paymentRequest, walletId);
      bot.sendMessage(chatId, 'Payment successful for invoice: ' + invoiceUID);

  } catch (error) {
      console.error('Error during the payment process', error);
      bot.sendMessage(chatId, "Error processing your payment. Please try again later.");
  }
});

//fix these then create video
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
  //const results = [];

    // Check if the inline query starts with 'addAPI'
    if (queryText.startsWith('addAPI ')) {
      const apiKey = queryText.slice(7).trim(); // Extract the API key after 'addAPI '

      try {
          // Check if the telegram_id already exists in the users table
          const dbResult = await dbClient.query(
              'SELECT api_keys FROM users WHERE telegram_id = $1',
              [userId]
          );

          let responseMessage;
          if (dbResult.rows.length > 0) {
              // User exists, update
              const userData = await fetchUserData(apiKey);
              const params = [apiKey];
              let updateQuery = `UPDATE users SET api_keys = $1`;

              for (const wallet of userData.me.defaultAccount.wallets) {
                  if (wallet.walletCurrency === 'BTC') {
                      params.push(wallet.id);
                      updateQuery += `, walletid_btc = $${params.length}`;
                  } else if (wallet.walletCurrency === 'USD') {
                      params.push(wallet.id);
                      updateQuery += `, walletid_usd = $${params.length}`;
                  }
              }

              params.push(userId);
              updateQuery += ` WHERE telegram_id = $${params.length}`;
              await dbClient.query(updateQuery, params);
              responseMessage = "API key and wallet IDs updated successfully.";

          } else {
              // User does not exist, insert
              const userData = await fetchUserData(apiKey);
              const params = [apiKey];
              let insertQuery = `INSERT INTO users (api_keys, walletid_btc, walletid_usd, telegram_id) VALUES ($1`;

              for (const wallet of userData.me.defaultAccount.wallets) {
                  if (wallet.walletCurrency === 'BTC') {
                      params.push(wallet.id);
                      insertQuery += `, $${params.length}`;
                  } else if (wallet.walletCurrency === 'USD') {
                      params.push(wallet.id);
                      insertQuery += `, $${params.length}`;
                  }
              }

              params.push(userId);
              insertQuery += `, $${params.length})`;
              await dbClient.query(insertQuery, params);
              responseMessage = "API key and wallet IDs stored successfully.";
          }

          // Prepare and send the inline query response
          const results = [{
              type: 'article',
              id: '1',
              title: responseMessage,
              input_message_content: {
                  message_text: responseMessage
              }
          }];

          bot.answerInlineQuery(inlineQuery.id, results);

      } catch (err) {
          console.error('Error handling inline query for addAPI', err);
          // You cannot send error messages directly to the chat in inline queries, so consider logging this error.
          const errorMessage = "An error occurred while processing your request. Please try again.";
          const results = [{
              type: 'article',
              id: 'error',
              title: errorMessage,
              input_message_content: {
                  message_text: errorMessage
              }
          }];

          bot.answerInlineQuery(inlineQuery.id, results);
      }
  }

  // if (queryText.startsWith("pay")) {
  //   const uuid = queryText.split(" ")[1];  // Assuming the format is "pay UUID"
  //   if (uuid) {
  //     // Create an article result with payment details
  //     results.push({
  //       type: 'article',
  //       id: uuid,
  //       title: 'Confirm Payment',
  //       input_message_content: {
  //         message_text: `🔹 **Confirm Your Payment**\n\n*Invoice ID:* \`${uuid}\`\n\n`,
  //         parse_mode: 'Markdown'
  //       },
  //       reply_markup: {
  //         inline_keyboard: [[
  //             { text: "Pay Now", callback_data: `PAY_${uuid}` }
  //         ]]
  //     },
  //       description: `Tap to send and confirm payment for Invoice ID ${uuid}`  // Adding a description for clarity
  //     });
  //   } else {
  //     // Handle the case where UUID might be missing or incorrectly formatted
  //     console.error("No UUID found after 'pay' keyword.");
  //   }
  // } else if (queryText.startsWith("generateinvoice")) {
  //   const args = queryText.split(" ");
  //   if (args.length >= 3) {
  //     const walletType = args[1].toUpperCase();
  //     const amountStr = args[2];
  //     const amount = parseInt(amountStr, 10);

  //     const dbResult = await dbClient.query(
  //       'SELECT * FROM users WHERE telegram_id = $1',
  //       [userId]
  //   );

  //   console.log("dbResult:",dbResult)

  //   const userExists = dbResult.rows.length > 0;
  //     // Assuming checkApiKey function to check if the user has an API key associated
  //     if (userExists) {
  //       console.log(dbResult.rows[0])
  //       // Fetch the API key and attempt to create an invoice
  //       const apiKey = dbResult.rows[0].api_keys;
  //       const walletId = walletType === 'BTC' ? dbResult.rows[0].walletid_btc : dbResult.rows[0].walletid_usd;
  //       console.log("API Key:", apiKey, "walletType:", walletType ,"Wallet ID:", walletId, "Amount:", amount)
  //       const getInvoice = await createInvoiceOnBehalfOfRecipient(apiKey, walletType, walletId, amount);
  //       const invoiceJSON = JSON.stringify(getInvoice)

  //       const UUID = uuidv4();
  //       const query = 'INSERT INTO invoices (invoice_data, invoice_uuid, wallet_type) VALUES ($1, $2, $3)';
  //       const currencyType = walletType == "BTC" ? "Sats" : "Cents";
  //       await dbClient.query(query, [invoiceJSON, UUID, walletType]).then(() => {

  //         results.push({
  //           type: 'article',
  //           id: UUID, // Assume generateInvoice returns an object with a uuid
  //           title: 'Invoice Generated',
  //           input_message_content: {
  //             message_text: `🔹 **Invoice Generated**\n\n*Invoice ID:* \`${UUID}\`\n*Amount:* \`${amount} ${currencyType}\`\n\nPlease confirm to proceed with the payment.`,
  //             parse_mode: 'Markdown'
  //           },
  //           reply_markup: {
  //             inline_keyboard: [[
  //                 { text: "Confirm", callback_data: `PAY_${UUID}` }
  //             ]]
  //         },
  //           description: `Invoice for ${amount} ${walletType} ready. Tap to confirm and send.`
  //         });

  //       });
      
  //     } else {
  //       results.push({
  //         type: 'article',
  //         id: 'no-api-key',
  //         title: 'No API Key Found',
  //         input_message_content: {
  //           message_text: `🚫 **No API Key Found**\n\nPlease configure your API key to generate invoices.`,
  //           parse_mode: 'Markdown'
  //         },
  //         description: `No API Key found. Please add your API key to generate invoices.`
  //       });
  //     }
  //   }
  // }

  // bot.answerInlineQuery(query.id, results).catch(error => {
  //   console.error("Failed to answer inline query:", error);
  // });
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