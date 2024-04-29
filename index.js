const botKey = "6320301632:AAE43srePE7IXcS164kNli-8sSQmX9A9Qvg";
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
          bot.sendMessage(chatId, "Welcome! Blink API Key doesn't exists, Please add one Checkout /help.");
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
    //create and send the invoice pack
    const validFormat = /^(BTC|USD)\s+\d+$/.test(msg.text);

    if(!validFormat){
      bot.sendMessage(chatId, "Invalid input format. Please start invoice generation again with /createInvoice.");
    }else{
      const [walletType, amount] = msg.text.match(/^(BTC|USD)\s+(\d+)$/);

      const dbResult = await dbClient.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [userId]
    );

    console.log("dbResult:",dbResult)
        
    }


    bot.sendMessage(chatId, "Request xyz for :", options);
  }

});

// Event handler for inline keyboard button clicks
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  // Handle different button clicks
  switch (data) {
      case 'Pay':
          bot.sendMessage(chatId, 'You paid successfully');
          break;
      case 'Cancel':
          bot.sendMessage(chatId, 'Payment Cancelled');
          break;
      case 'CheckStatus':
          bot.sendMessage(chatId, 'Showing current payment Status');
          break;
      default:
          // Handle unknown button click
          bot.sendMessage(chatId, 'Unknown option clicked, please try again.');
          break;
  }
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

async function createInvoiceOnBehalfOfRecipient(apiKey, currency,recipientWalletId, amount) {
  const url = 'https://api.blink.sv/graphql';
  const headers = {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey
  };

  const query1 = `
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

  const query2 = `mutation LnUsdInvoiceCreateOnBehalfOfRecipient($input: LnUsdInvoiceCreateOnBehalfOfRecipientInput!) {
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

  const query = currency === 'BTC' ? query1 : query2;

  const variables = {
      input: {
          amount: amount,  // The amount for the invoice, as a string
          recipientWalletId: recipientWalletId
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

      console.log('Invoice Creation Result:', responseData.data);
  } catch (error) {
      console.error('Error creating invoice:', error);
  }
}