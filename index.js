require('dotenv').config()

const botKey = process.env.BOTKEY;
const { Client, Pool } = require('pg');

//require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_TOKEN = botKey;  // Store your token in .env file
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const BLINK_API_URL = 'https://dev.blink.sv/api';

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

// Define the options for the inline keyboard
const options = {
  reply_markup: JSON.stringify({
      inline_keyboard: [
          [
              { text: 'Pay', callback_data: 'Pay' },
              { text: 'Cancel', callback_data: 'Cancel' }
          ],
          [
              { text: 'CheckStatus', callback_data: 'CheckStatus' }
          ]
      ]
  })
};

bot.onText(/\/start/, async (msg) => {

  const chatId = msg.chat.id;
  const helpMessage = "Welcome! This bot can send and receive sats via Blink. Here are the available commands:\n\n" + 
  "/start or /help - Show all available commands \n\n" + 
  "/addAPI - Adds a new API_Key for your Blink account or replaces it if it already exists\n" +
  "/balance - Shows the balances in your Blink wallet\n" +
  "/createInvoice - Creates an invoice for USD or sats";
  bot.sendMessage(chatId, helpMessage);

});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = "Welcome! This bot can send and receive sats via Blink. Here are the available commands:\n\n" + 
  "/start or /help - Show all available commands \n\n" + 
  "/addAPI - Adds a new API_Key for your Blink account or replaces it if it already exists\n" +
  "/balance - Shows the balances in your Blink wallet\n" +
  "/createInvoice - Creates an invoice for USD or sats";
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
              message += `BTC: ${balanceArray.BTC} sats\n`;
          }
          if (balanceArray.USD !== undefined) {
              message += `USD: ${balanceArray.USD}\n`;
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

bot.on('message', async (msg) => {

  console.log("Message received:", msg.text)

  const chatId = msg.chat.id;
  const state = await client.get(`chat:${chatId}:state`);
  const userId = msg.from.id;

  if (state === 'awaiting_input') {
      const apiKey = msg.text;
      const userId = msg.from.id; // Telegram user ID

      console.log("API key received:", apiKey);

      try {
        // Fetch user data from the GraphQL API
        console.log("Fetching user data...")
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

        console.log("Update query:", updateQuery);
        console.log("Params:", params);

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
        const query = 'INSERT INTO invoices (invoice_data, invoice_uuid) VALUES ($1, $2)';
        await dbClient.query(query, [invoiceJSON, UUID]);

        if(walletType === 'BTC') {
          sendInvoiceDetailsToUser(chatId, UUID, amount, walletType);
        }else{
          sendInvoiceDetailsToUser(chatId, UUID, amount);
        }
       
    } catch (error) {
        console.error("Error during invoice creation process:", error);
        bot.sendMessage(chatId, `Failed to create invoice due to an ${error}. Please try again.`);
    }
}

});

// Event handler for inline keyboard button clicks
bot.on('callback_query', async (callbackQuery) => {
  console.log("Inside CallBACK query")
  console.log("Callback Query:", callbackQuery.message)

  //const chatId =  callbackQuery.inline_message_id?callbackQuery.inline_message_id : callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const action = data.split('_')[0];  // Get the action part
  const invoiceUID = data.split('_')[1];  // Get the UID part, present in all cases now

  console.log("InvoiceID: ", invoiceUID)

  if(callbackQuery.inline_message_id){

    switch (action) {
      case 'PAY':
      case 'CANCEL':
      case 'CHECK':
        // Update the inline message to reflect the new state
        bot.editMessageText(`Action ${action} for invoice ${invoiceUID} processed`, {
          inline_message_id: callbackQuery.inline_message_id
        });
        break;
      default:
        console.log('Unknown inline action');
        break;
    }

  }else if(callbackQuery.message && callbackQuery.message.chat.id){ 

    const chatId = callbackQuery.message.chat.id;

    switch (action) {
      case 'PAY':
          // Handle payment
          //processPayment(chatId, invoiceUID);
          //put userID here, if generated one == userID then don't process
          // else process
          //check is userID has the api keys
          //if yes then process
          //else send message to add api keys
          bot.sendMessage(chatId, 'Payment Done for invoice: ' + invoiceUID);
          break;
      case 'CANCEL':
          // Handle cancellation
          //cancel work in both ways
          bot.sendMessage(chatId, 'Payment Cancelled for invoice: ' + invoiceUID);
          break;
      case 'CHECK':
          // Handle status check
          //checkInvoiceStatus(chatId, invoiceUID);
          //check work in both ways
          bot.sendMessage(chatId, 'Payment Cancelled for invoice: ' + invoiceUID);
          break;
      case 'CONFIRM':
        console.log("Processing payment for UUID:", invoiceUID);
    // Implement payment processing logic here
    bot.sendMessage(chatId, `Payment processed for ${invoiceUID}`);
      default:
          // Handle unknown button click
          bot.sendMessage(chatId, 'Unknown option clicked, please try again.');
          break;
  }

  }

});

function sendInvoiceDetailsToUser(chatId, invoiceUID, amount, walletType ) {

  const detailsMessage = `Pay the invoice \nPayment Request: XYZ USER \n Amount: ${amount} ${walletType == "BTC" ? "Sats" : "USD" }`;
  const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Pay', callback_data: `PAY_${invoiceUID}` }],
          [{ text: 'Cancel', callback_data: `CANCEL_${invoiceUID}` }],
          [{ text: 'Check Status', callback_data: `CHECK_${invoiceUID}` }]
      ]
      }
  };

  bot.sendMessage(chatId, detailsMessage, opts);
}

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

bot.on('inline_query', (query) => {
  console.log("Inline QUERY")
  const queryText = query.query.trim();
  console.log("QUERY TEXT:",queryText)
  const results = [];

  if (queryText.startsWith("pay")) {
    const uuid = queryText.split(" ")[1];  // Assuming the format is "pay UUID"
    if (uuid) {
      // Create an article result with payment details
      results.push({
        type: 'article',
        id: uuid,
        title: 'PAY',
        input_message_content: {
          message_text: `Confirm your payment for ${uuid}: \n\`MONOTOUCH\``,
          parse_mode: 'Markdown'
        },
        reply_markup: {
          inline_keyboard: [[
            { text: "Confirm", callback_data: `PAY_${uuid}` }
          ]]
        }
      });
    }
  }

  bot.answerInlineQuery(query.id, results);
});