require('dotenv').config()

const { Telegraf } = require('telegraf');
const { Client } = require('pg');
const { v4: uuidv4 } = require('uuid');

const botKey = process.env.BOTKEY;
const bot = new Telegraf(botKey);

const initialMessage = "Welcome! This bot can send and receive sats via Blink. Here are the available commands:\n\n" +
  "/start or /help - Show all available commands \n\n" +
  "/addAPI apiKey - Add or replace existing Blink APIKey \n" +
  "/balance - Shows the balances in your Blink wallet\n" +
  "/createInvoice walletType amount - Creates an invoice \n" +
  "/pay uuid - Pay the invoice using the invoiceID";

// PostgreSQL connection setup
const dbClient = new Client({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',  // Make sure 'PGHOST' is set to 'postgres'
  database: process.env.PGDATABASE || 'postgres',
  password: process.env.PGPASSWORD || 'mysecretpassword',
  port: process.env.PGPORT || 5432,
});

dbClient.connect();

bot.start((ctx) => ctx.reply(initialMessage));
bot.help((ctx) => ctx.reply(initialMessage));

const buildAuthorizationUrl = require('./utils');

bot.command('addAPI', async (ctx) => {
  const userId = ctx.from.id;
  //const apiKey = ctx.message.text.split(' ')[1];

  try {
    const authorizationUrl = buildAuthorizationUrl(userId);

    ctx.reply(`Click this link to authorize the app and connect your account: ${authorizationUrl}`);

  } catch (err) {
    console.error('Database query error', err.stack);
    ctx.reply("Error accessing your data. Please try again later.");
  }
});

//error code and reply
bot.command('balance', async (ctx) => {
  console.log("INSIDEBALANCE:", ctx.from.id);
  const userId = ctx.from.id;

  try {
    const dbResult = await dbClient.query('SELECT * FROM users WHERE telegramid = $1', [userId]);

    // Log the dbResult for debugging
    console.log('DB Result:', dbResult.rows);

    if (dbResult.rows.length > 0) {
      const createdTime = dbResult.rows[0].created;
      console.log('Created Time:', createdTime);

      const token = dbResult.rows[0].token;

      if (!token) {
        ctx.reply("Token is missing. Please use /addAPI to generate your Token key.");
        return;
      }

      const userData = await fetchUserDataNew(token);
      let balanceArray = {};

      for (const wallet of userData.me.defaultAccount.wallets) {
        if (wallet.walletCurrency === 'BTC') {
          balanceArray.BTC = wallet.balance;
        } else if (wallet.walletCurrency === 'USD') {
          balanceArray.USD = wallet.balance;
        }
      }

      let message = "Your balances:\n";
      if (balanceArray.BTC !== undefined) {
        message += `BTC Wallet: ${balanceArray.BTC} sats\n`;
      }
      if (balanceArray.USD !== undefined) {
        message += `USD Wallet: ${balanceArray.USD} cents\n`;
      }

      ctx.reply(message);

    } else {
      console.log("No rows found for user in the database.");
      ctx.reply("Token key not found or expired. Please use /addAPI command to generate your Token key.");
    }
  } catch (error) {
    console.error('Failed to retrieve balance:', error);
    ctx.reply("Failed to retrieve balance token expired. Please try again after regenerating key.");
  }
});

bot.command('createInvoice', async (ctx) => {
  const userId = ctx.from.id;
  const parts = ctx.message.text.split(' ');
  const walletType = parts[1].toUpperCase();
  const amount = parseInt(parts[2], 10);

  console.log(userId, walletType, amount)

  try {
    const userResult = await dbClient.query('SELECT token, walletid_btc, walletid_usd FROM users WHERE telegramid = $1', [userId]);

    if (userResult.rows.length === 0) {
      ctx.reply("Blink API Key doesn't exist. Please add one. Check /help.");
      return;
    }

    const walletId = walletType === 'BTC' ? userResult.rows[0].walletid_btc : userResult.rows[0].walletid_usd;
    const apiKey = userResult.rows[0].token;

    console.log("WALLET ID token", walletId, apiKey)

    const invoiceResponse = await createInvoiceOnBehalfOfRecipientNew(apiKey, walletType, walletId, amount);

    if (invoiceResponse == null) {
      ctx.reply("Failed to create invoice. Please try again.");
      return;
    }

    console.log("INVOICE GENERATED", invoiceResponse)

    let paymentRequest = null;
    if (invoiceResponse.lnInvoiceCreateOnBehalfOfRecipient) {
      paymentRequest = invoiceResponse.lnInvoiceCreateOnBehalfOfRecipient.invoice.paymentRequest;
    } else if (invoiceResponse.lnUsdInvoiceCreateOnBehalfOfRecipient) {
      paymentRequest = invoiceResponse.lnUsdInvoiceCreateOnBehalfOfRecipient.invoice.paymentRequest;
    }

    // Handle the case when no valid invoice response is found
    if (!paymentRequest) {
      ctx.reply("Invoice creation failed. Please try again.");
      return;
    }

    const currencyType = walletType == "BTC" ? "Sats" : "Cents";
    const detailsMessage = `*Pay the invoice for amount:* ${amount} ${currencyType}\n Generated for ${walletType}  \n*Use this code for payment:* \`${paymentRequest}\``;
    ctx.replyWithMarkdown(detailsMessage);
  } catch (error) {
    console.error('Error during invoice creation process', error);
    ctx.reply("Error accessing your data. Please try again later.");
  }
});

//pay is remaning only - rest are done 
//complete and message and submit final evaluation form
bot.command('pay', async (ctx) => {
  const userId = ctx.from.id;
  const paymentRequest = ctx.message.text.split(' ')[1];

  console.log(userId, invoiceUID)

  ctx.reply('Payment successful for invoice: ' + invoiceUID);

  try {
    const userResult = await dbClient.query('SELECT * FROM users WHERE telegramid = $1', [userId]);

    if (userResult.rows.length === 0) {
      ctx.reply("No API Key found. Please add your API key to generate invoices.");
      return;
    }

    const apiKey = userResult.rows[0].api_keys;
    await sendInvoicePayment(apiKey, paymentRequest, walletId);
    ctx.reply('Payment successful for invoice: ' + invoiceUID);
  } catch (error) {
    console.error('Error during the payment process', error);
    ctx.reply("Error processing your payment. Please try again later.");
  }
});

//--------------------------------------------------------------------------------------------------------------

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
    console.log("BLANCE DATA:", data)
    return data.data;
  } catch (error) {
    console.error('Error making the request:', error);
    throw error;
  }
}

async function createInvoiceOnBehalfOfRecipientNew(token, currency, recipientWalletId, amount) {
  const url = 'https://api.staging.blink.sv/graphql';
  const headers = {
    'Content-Type': 'application/json',
    'Oauth2-Token': token
  };

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

  const query = currency === 'BTC' ? queryBTC : queryUSD;

  const variables = {
    input: {
      amount: amount,
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
      throw new Error(`HTTP error, status = ${response.status}, details = ${JSON.stringify(responseData)}`);
    }

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
    return responseData.data;
  } catch (error) {
    console.error('Error creating invoice:', error.message);
    throw error;
  }
}

//--------------------------------------------------------------------------------------------------------------

async function sendInvoicePayment(apiKey, paymentRequest, walletId) {
  const url = 'https://api.blink.sv/graphql';
  const headers = {
    'Content-Type': 'application/json',
    'X-API-KEY': apiKey
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
      paymentRequest: paymentRequest,
      walletId: walletId
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

bot.launch();
