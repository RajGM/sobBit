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

bot.onText(/\/start/, async (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome! This bot can send and receive sats via Blink. Use /send and /balance commands.");
  const chatId = msg.chat.id; // Unique identifier for the chat
  const userId = msg.from.id; // Unique and permanent identifier for the user
  console.log(userId);

  try {
    const res = await dbClient.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
    if (res.rows.length > 0) {
      // User exists, show details
      const user = res.rows[0];
      bot.sendMessage(chatId, `Welcome back! Your Wallet ID is ${user.wallet_id} and your balance is ${user.balance}.`);
    } else {
      // No user found, ask for API keys
// Set key with expiration
await dbClient.query(
  'INSERT INTO users (telegram_id) VALUES ($1)',
  [userId]
);
      await client.setEx(`chat:${chatId}:state`, 180, 'awaiting_input'); // Expires after 1 hour
      bot.sendMessage(chatId, "Welcome! Please input your data.");
      //bot.sendMessage(userId, "Welcome! Please provide your Blink API keys to continue.");
      
      // Setup to receive further messages or command to input API keys
    }
  } catch (err) {
    console.error('Database query error', err.stack);
    bot.sendMessage(userId, "Error accessing your data. Please try again later.");
  }


});

bot.onText(/\/balance/, async (msg) => {
  const blinkKey = process.env.BLINK_API_KEY;  // Store your Blink API key in .env file
  try {
    const response = await axios.get(`${BLINK_API_URL}/balance`, { headers: { 'Authorization': `Bearer ${blinkKey}` } });
    bot.sendMessage(msg.chat.id, `Your balance is ${response.data.balance} sats.`);
  } catch (error) {
    bot.sendMessage(msg.chat.id, "Failed to retrieve balance. Please try again.");
  }
});

bot.onText(/\/send (\d+) (\S+)/, async (msg, match) => {
  const amount = match[1];
  const recipient = match[2];
  const blinkKey = process.env.BLINK_API_KEY;
  
  try {
    const response = await axios.post(`${BLINK_API_URL}/send`, {
      recipient,
      amount
    }, { headers: { 'Authorization': `Bearer ${blinkKey}` } });
    bot.sendMessage(msg.chat.id, `Sent ${amount} sats to ${recipient}. Transaction status: ${response.data.status}`);
  } catch (error) {
    bot.sendMessage(msg.chat.id, `Failed to send sats. Error: ${error.response.data.message || error.message}`);
  }
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
Welcome to the Sats Management Bot! Here are the commands you can use:
/help - Show all available commands
/addAPIkey - Add your Blink API key to manage your sats
/createInvoice - Create an invoice with a specific amount of sats
/showBalance - Fetch and display your balance from Blink
`;
  bot.sendMessage(chatId, helpMessage);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const state = await client.get(`chat:${chatId}:state`);

  if (state === 'awaiting_input') {
      const apiKey = msg.text;
      const userId = msg.from.id; // Telegram user ID

      // Store API key in PostgreSQL database
      try {
          await dbClient.query(
              `UPDATE users SET api_keys = $1 WHERE telegram_id = $2`,
              [apiKey, userId]
          );
          await client.del(`chat:${chatId}:state`, `chat:${chatId}:data`);
          bot.sendMessage(chatId, "API key stored successfully.");
      } catch (error) {
          console.error('Error storing API key in database:', error);
          bot.sendMessage(chatId, "An error occurred while storing the API key.");
      }
  }
});