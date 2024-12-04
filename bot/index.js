require('dotenv').config()
const QRCode = require('qrcode');

const { Telegraf } = require('telegraf');
const { Client } = require('pg');

const botKey = process.env.BOTKEY;
const bot = new Telegraf(botKey);

const initialMessage = "Welcome! This bot can send and receive sats via Blink. Here are the available commands:\n\n" +
  "/start or /help - Show all available commands \n\n" +
  "/addAPI - Add or replace existing Blink APIKey via Oauth2 flow \n" +
  "/balance - Shows the balances in your Blink wallet\n" +
  "/invoice walletType(BTC or USD) amount - Creates an invoice \n" +
  "/pay walletType(BTC or USD) paymentRequest - Pay the invoice using the paymentRequest";

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
  const userId = ctx.from.id;

  try {
    const dbResult = await dbClient.query('SELECT * FROM users WHERE telegramid = $1', [userId]);

    if (dbResult.rows.length > 0) {

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
      console.log("BALANCE MESSAGE:", message)
      ctx.reply(message);

    } else {
      //console.log("No rows found for user in the database.");
      ctx.reply("Token key not found or expired. Please use /addAPI command to generate your Token key.");
    }
  } catch (error) {
    //console.error('Failed to retrieve balance:', error);
    ctx.reply("Failed to retrieve balance token expired. Please try again after regenerating key.");
  }
});

bot.command('invoice', async (ctx) => {
  const userId = ctx.from.id;
  const parts = ctx.message.text.split(' ');
  const walletType = parts[1].toUpperCase();
  const amount = parseInt(parts[2], 10);

  if(walletType.toUpperCase() !== 'BTC' && walletType.toUpperCase() !== 'USD') {
    ctx.reply("Invalid wallet type. Please use BTC or USD.");
    return;
  }

  if(isNaN(amount) || amount <= 0) {
    ctx.reply("Invalid amount. Please enter a valid amount.");
    return;
  }

  try {
    const userResult = await dbClient.query('SELECT * FROM users WHERE telegramid = $1', [userId]);

    if (userResult.rows.length === 0) {
      ctx.reply("Blink API Key doesn't exist. Please add one. Check /help.");
      return;
    }

    console.log(userResult.rows[0])
    if (!userResult.rows[0].walletid_btc || !userResult.rows[0].walletid_usd) {
      ctx.reply("Please add api key to generate invoice. Check /help.");
      return;
    }

    let invoiceResponse = null;

    if(walletType.toUpperCase() === 'BTC') {
      invoiceResponse = await createInvoiceOnBehalfOfRecipientNewWithOutToken(walletType, userResult.rows[0].walletid_btc, amount);
    }else if(walletType.toUpperCase() === 'USD') {
      invoiceResponse = await createInvoiceOnBehalfOfRecipientNewWithOutToken(walletType, userResult.rows[0].walletid_usd, amount);
    }

    if (invoiceResponse == null) {
      ctx.reply("Failed to create invoice. Please try again.");
      return;
    }

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

    // Generate the QR code for the payment request
    QRCode.toDataURL(paymentRequest, async (err, qrCodeData) => {
      if (err) {
        console.error('Error generating QR code:', err);
        ctx.reply("Failed to generate QR code. Please use the payment request code.");
        return;
      }

      // Send the QR code along with the invoice details
      await ctx.replyWithMarkdown(detailsMessage);
      await ctx.replyWithPhoto({ source: Buffer.from(qrCodeData.split(',')[1], 'base64') });
    });

  } catch (error) {
    console.error('Error during invoice creation process', error);
    ctx.reply("Error accessing your data. Please try again later.");
  }
});

bot.command('pay', async (ctx) => {
  const userId = ctx.from.id;
  const walletType = ctx.message.text.split(' ')[1];
  const paymentRequest = ctx.message.text.split(' ')[2];

  if(walletType.toUpperCase() !== 'BTC' && walletType.toUpperCase() !== 'USD') {
    ctx.reply("Invalid wallet type. Please use BTC or USD.");
    return;
  }

  if(!paymentRequest || paymentRequest.length === 0) {
    ctx.reply("Invalid payment request. Please enter a valid payment request.");
    return;
  }

  try {
    const userResult = await dbClient.query('SELECT * FROM users WHERE telegramid = $1', [userId]);

    if (userResult.rows.length === 0) {
      ctx.reply("No API Key found. Please add your API key to generate invoices.");
      return;
    }

    // try with each if one is success then do
    const apiKey = userResult.rows[0].token;
    await sendInvoicePaymentNew(apiKey, walletType, paymentRequest);
    ctx.reply('Payment successful for invoice');
  } catch (error) {
    //console.error('Error during the payment process', error);
    console.log("ERROR", error)
    ctx.reply("Error processing your payment - Error:" + error);
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

    //console.log("BALANCE DATA:", data)
    //return data.data;  // this should be the ione that is returned
    return walletId;
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

async function sendInvoicePaymentNew(apiKey, walletType, paymentRequest) {

  const userData = await fetchUserDataNew(apiKey);
  let walletId = {};

  for (const wallet of userData.me.defaultAccount.wallets) {
    if (wallet.walletCurrency === 'BTC' && walletType.toUpperCase() === 'BTC') {
      console.log("WALLET ID", wallet.id)
      walletId = wallet.id;
    } else if (wallet.walletCurrency === 'USD' && walletType.toUpperCase() === 'USD') {
      console.log("WALLET ID", wallet.id)
      walletId = wallet.id;
    }
  }


  const url = 'https://api.staging.blink.sv/graphql';
  const headers = {
    'Content-Type': 'application/json',
    'Oauth2-Token': apiKey
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

    //console.log('Payment Status:', responseData.data.lnInvoicePaymentSend);
    if (responseData.data.lnInvoicePaymentSend.status === 'FAILURE') {
      throw new Error(`Payment failed: ${responseData.data.lnInvoicePaymentSend.errors.map(err => err.message).join(', ')}`);
    }
  } catch (error) {
    throw error;
  }
}

async function createInvoiceOnBehalfOfRecipientNewWithOutToken(currency, recipientWalletId, amount) {
  const url = 'https://api.staging.galoy.io:443/graphql';
  const headers = {
    'Content-Type': 'application/json'
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
bot.launch();
