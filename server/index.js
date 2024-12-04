const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = 3000;
require('dotenv').config();

app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

// PostgreSQL connection setup
const { Client } = require('pg');

const dbClient = new Client({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',  // Make sure 'PGHOST' is set to 'postgres'
  database: process.env.PGDATABASE || 'postgres',
  password: process.env.PGPASSWORD || 'mysecretpassword',
  port: process.env.PGPORT || 5432,
});

dbClient.connect();

// Middleware to log all incoming requests
app.all('*', async (req, res) => {

  const authorizationCode = req.query.code;
  const state = req.query.state;

  // Check if code and state exist in the query
  if (authorizationCode && state) {
    // Call the getToken function with the extracted code and state

    const token = await getToken(authorizationCode, state);

    //logTokenToConsole(state, token);
    const walletData = await fetchUserDataNew(token);
    
    storeToken(state, token, walletData.BTC, walletData.USD);

    // Log token to the console (replace this with Telegram bot action later)

    res.send(`Code and state received. Token Saved Authorization code: ${authorizationCode}, State: ${state}`);
  } else {
    // If code or state is missing, return an error
    res.status(400).send('Missing code or state in the request');
  }

});

// Error handling middleware for aborted requests
app.use((err, req, res, next) => {
  if (err && err.code === 'ECONNABORTED') {
    console.error('Request aborted:', err);
    return res.status(400).send('Request was aborted');
  }
  next(err);
});

app.listen(port, () => {
  console.log(`Dummy server is running on http://localhost:${port}`);
});

// Function to fetch token from OAuth provider
async function getToken(authorizationCode, state) {

  const url = 'https://oauth.staging.blink.sv/oauth2/token';

  // Create the basic auth header value
  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  // Define the body parameters
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', authorizationCode); // Use extracted authorization code
  params.append('redirect_uri', `${CALLBACK_URL}`); // Use fixed callback URL with state

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP error! Status: ${response.status}, Body: ${errorBody}`);
    }

    const data = await response.json();
    console.log('Access Token:', data.access_token);

    return data.access_token;  // Return the access token
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

// Function to store token in the database
async function storeToken(telegramid, token, walletid_btc, walletid_usd) {
  try {
    const query = `
      INSERT INTO users (telegramid, token, walletid_btc, walletid_usd, created) 
      VALUES ($1, $2, $3, $4, NOW()) 
      ON CONFLICT (telegramid) 
      DO UPDATE SET 
        token = EXCLUDED.token, 
        walletid_btc = EXCLUDED.walletid_btc, 
        walletid_usd = EXCLUDED.walletid_usd,
        created = NOW();
    `;

    await dbClient.query(query, [telegramid, token, walletid_btc, walletid_usd]);
    console.log(`Token and wallet IDs for user ${telegramid} stored/updated successfully.`);
  } catch (error) {
    console.error('Error storing token and wallet IDs in the database:', error.message);
  }
}

//make this return the wallet IDs
async function fetchUserDataNew(token) {
  const url = 'https://api.staging.blink.sv/graphql';
  const headers = {
    'Content-Type': 'application/json',
    'Oauth2-Token': token
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
    const walletData = data.data;

    let walletId = {};

    for (const wallet of walletData.me.defaultAccount.wallets) {
      console.log(wallet)
      if (wallet.walletCurrency === 'BTC') {
        walletId.BTC = wallet.id;
      } else if (wallet.walletCurrency === 'USD') {
        walletId.USD = wallet.id;
      }
    }

    console.log("WALLET DATA:", walletId)
    return walletId;
  } catch (error) {
    console.error('Error making the request:', error);
    throw error;
  }
}