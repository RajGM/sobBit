const botKey = "6320301632:AAE43srePE7IXcS164kNli-8sSQmX9A9Qvg";
const { Client } = require('pg');

//require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_TOKEN = botKey;  // Store your token in .env file
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const BLINK_API_URL = 'https://dev.blink.sv/api';

// PostgreSQL connection setup
const dbClient = new Client({
    connectionString: 'postgresql://myuser:mypassword@localhost:5432/mydatabase'
});

dbClient.connect();

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome! This bot can send and receive sats via Blink. Use /send and /balance commands.");
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

