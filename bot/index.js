require('dotenv').config()
//const dotenv = require('dotenv')

const { Telegraf } = require('telegraf');
const { Client } = require('pg');
//const fetch = require('node-fetch');
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
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'mysecretpassword',
  port: 5432,
});

dbClient.connect();

bot.start((ctx) => ctx.reply(initialMessage));
bot.help((ctx) => ctx.reply(initialMessage));

const buildAuthorizationUrl = require('./utils');

bot.command('addAPI', async (ctx) => {
  const userId = ctx.from.id;
  //const apiKey = ctx.message.text.split(' ')[1];

  try {
    //const dbResult = await dbClient.query('SELECT api_keys FROM users WHERE telegram_id = $1', [userId]);

    const authorizationUrl = buildAuthorizationUrl(userId);

    // const userData = await fetchUserData(apiKey);
    printObject("authorizationUrl:", authorizationUrl);

    ctx.reply(`Click this link to authorize the app and connect your account: ${authorizationUrl}`);

    // if (dbResult.rows.length > 0) {
    //   const params = [apiKey];
    //   let updateQuery = `UPDATE users SET api_keys = $1`;

    //   for (const wallet of userData.me.defaultAccount.wallets) {
    //     if (wallet.walletCurrency === 'BTC') {
    //       params.push(wallet.id);
    //       updateQuery += `, walletid_btc = $${params.length}`;
    //     } else if (wallet.walletCurrency === 'USD') {
    //       params.push(wallet.id);
    //       updateQuery += `, walletid_usd = $${params.length}`;
    //     }
    //   }

    //   params.push(userId);
    //   updateQuery += ` WHERE telegram_id = $${params.length}`;
    //   console.log("Update Query:", updateQuery, "Params:", params);

    //   await dbClient.query(updateQuery, params);
    //   ctx.reply("API key and wallet IDs updated successfully.");
    // } else {
    //   const params = [apiKey];
    //   let insertQuery = `INSERT INTO users (api_keys, walletid_btc, walletid_usd, telegram_id) VALUES ($1`;

    //   for (const wallet of userData.me.defaultAccount.wallets) {
    //     if (wallet.walletCurrency === 'BTC') {
    //       params.push(wallet.id);
    //       insertQuery += `, $${params.length}`;
    //     } else if (wallet.walletCurrency === 'USD') {
    //       params.push(wallet.id);
    //       insertQuery += `, $${params.length}`;
    //     }
    //   }

    //   params.push(userId);
    //   insertQuery += `, $${params.length})`;
    //   console.log("Insert Query:", insertQuery, "Params:", params);

    //   await dbClient.query(insertQuery, params);
    //   ctx.reply("API key and wallet IDs stored successfully.");
    // }

  } catch (err) {
    console.error('Database query error', err.stack);
    ctx.reply("Error accessing your data. Please try again later.");
  }
});

bot.command('balance', async (ctx) => {
  console.log("INSIDEBALANCE:", ctx.from.id)
  const userId = ctx.from.id;

  try {
    const dbResult = await dbClient.query('SELECT api_keys FROM users WHERE telegram_id = $1', [userId]);

    if (dbResult.rows.length > 0) {
      const blinkKey = dbResult.rows[0].api_keys;
      const userData = await fetchUserData(blinkKey);
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
      ctx.reply("Blink API key not found. Please use /addAPI command to save your Blink API key.");
    }
  } catch (error) {
    console.error('Failed to retrieve balance:', error);
    ctx.reply("Failed to retrieve balance. Please try again.");
  }
});

bot.command('createInvoice', async (ctx) => {
  const userId = ctx.from.id;
  const parts = ctx.message.text.split(' ');
  const walletType = parts[1].toUpperCase();
  const amount = parseInt(parts[2], 10);

  try {
    const userResult = await dbClient.query('SELECT api_keys, walletid_btc, walletid_usd FROM users WHERE telegram_id = $1', [userId]);

    if (userResult.rows.length === 0) {
      ctx.reply("Blink API Key doesn't exist. Please add one. Check /help.");
      return;
    }

    const walletId = walletType === 'BTC' ? userResult.rows[0].walletid_btc : userResult.rows[0].walletid_usd;
    const apiKey = userResult.rows[0].api_keys;
    const invoiceResponse = await createInvoiceOnBehalfOfRecipient(apiKey, walletType, walletId, amount);

    if (invoiceResponse == null) {
      ctx.reply("Failed to create invoice. Please try again.");
      return;
    }

    const invoiceJSON = invoiceResponse;
    const UUID = uuidv4();
    const query = 'INSERT INTO invoices (invoice_data, invoice_uuid, wallet_type) VALUES ($1, $2, $3)';
    await dbClient.query(query, [invoiceJSON, UUID, walletType]);

    const currencyType = walletType == "BTC" ? "Sats" : "Cents";
    const detailsMessage = `*Pay the invoice for amount:* ${amount} ${currencyType}\n*Use this code for payment:* \`${UUID}\``;
    ctx.replyWithMarkdown(detailsMessage);
  } catch (error) {
    console.error('Error during invoice creation process', error);
    ctx.reply("Error accessing your data. Please try again later.");
  }
});

bot.command('pay', async (ctx) => {
  const userId = ctx.from.id;
  const invoiceUID = ctx.message.text.split(' ')[1];

  try {
    const userResult = await dbClient.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);

    if (userResult.rows.length === 0) {
      ctx.reply("No API Key found. Please add your API key to generate invoices.");
      return;
    }

    const invoiceResult = await dbClient.query('SELECT * FROM invoices WHERE invoice_uuid = $1', [invoiceUID]);

    if (invoiceResult.rows.length === 0) {
      ctx.reply("No invoice found with ID: " + invoiceUID);
      return;
    }

    const invoice = invoiceResult.rows[0];
    const walletType = invoice.wallet_type;
    const walletId = walletType === 'BTC' ? userResult.rows[0].walletid_btc : userResult.rows[0].walletid_usd;
    const paymentRequest = findPaymentRequest(invoice.invoice_data);

    if (!paymentRequest) {
      ctx.reply("No payment request found for this invoice.");
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

bot.on('inline_query', async (ctx) => {
  const queryText = ctx.inlineQuery.query.trim().toLowerCase();

  if (queryText.startsWith('pay')) {
    const uuid = queryText.slice(4).trim();
    const results = [{
      type: 'article',
      id: '1',
      title: 'Pay Invoice',
      input_message_content: {
        message_text: `This is a test UUID with a button ${uuid}`
      },
      reply_markup: {
        inline_keyboard: [[
          { text: "Click Me", callback_data: `PAY_${uuid}` }
        ]]
      }
    }];

    await ctx.answerInlineQuery(results);
  }

  if (queryText.startsWith('createinvoice')) {
    const args = queryText.slice('createinvoice'.length).trim();
    const parts = args.split(' ');

    if (parts.length === 2) {
      const walletType = parts[0];
      const amount = parts[1];
      const invoiceText = `An invoice for ${amount} ${walletType.toUpperCase()}`;

      const results = [{
        type: 'article',
        id: '1',
        title: `Create Invoice for ${amount} ${walletType.toUpperCase()}`,
        input_message_content: {
          message_text: invoiceText
        },
        reply_markup: {
          inline_keyboard: [[
            {
              text: "Confirm Invoice",
              callback_data: `INVOICE_${walletType}_${amount}`
            }
          ]]
        }
      }];

      await ctx.answerInlineQuery(results);
    } else {
      const results = [{
        type: 'article',
        id: '1',
        title: 'Incorrect Format',
        input_message_content: {
          message_text: `Please use the format: createinvoice walletType amount`
        }
      }];
      await ctx.answerInlineQuery(results);
    }
  }

  if (queryText.startsWith('balance')) {
    const userId = ctx.from.id;
    const results = [{
      type: 'article',
      id: '1',
      title: 'Check Balance',
      input_message_content: {
        message_text: `This is a test to check balance: ${userId}`
      },
      reply_markup: {
        inline_keyboard: [[
          { text: "Click Me", callback_data: `BALANCE_${userId}` }
        ]]
      }
    }];

    await ctx.answerInlineQuery(results);
  }
});

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const action = data.split('_')[0];
  const userId = ctx.callbackQuery.from.id;

  if (ctx.callbackQuery.inline_message_id) {
    const invoiceUID = data.split('_')[1];

    switch (action) {
      case 'PAY':
        try {
          const userResult = await dbClient.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);

          if (userResult.rows.length === 0) {
            ctx.editMessageText("No API Key found. Please add your API key to generate invoices.", {
              inline_message_id: ctx.callbackQuery.inline_message_id
            });
            return;
          }

          const invoiceResult = await dbClient.query('SELECT * FROM invoices WHERE invoice_uuid = $1', [invoiceUID]);

          if (invoiceResult.rows.length === 0) {
            ctx.editMessageText("No invoice found with ID: " + invoiceUID, {
              inline_message_id: ctx.callbackQuery.inline_message_id
            });
            return;
          }

          const invoice = invoiceResult.rows[0];
          const walletType = invoice.wallet_type;
          const walletId = walletType === 'BTC' ? userResult.rows[0].walletid_btc : userResult.rows[0].walletid_usd;
          const paymentRequest = findPaymentRequest(invoice.invoice_data);

          if (!paymentRequest) {
            ctx.editMessageText("No payment request found for this invoice." + invoiceUID, {
              inline_message_id: ctx.callbackQuery.inline_message_id
            });
            return;
          }

          const apiKey = userResult.rows[0].api_keys;
          await sendInvoicePayment(apiKey, paymentRequest, walletId);
          ctx.editMessageText("Payment successful for invoice:" + invoiceUID, {
            inline_message_id: ctx.callbackQuery.inline_message_id
          });
        } catch (error) {
          console.error('Error during the payment process', error);
          ctx.editMessageText("Error processing your payment. Please try again later." + invoiceUID, {
            inline_message_id: ctx.callbackQuery.inline_message_id
          });
        }
        break;

      case 'BALANCE':
        try {
          const dbResult = await dbClient.query('SELECT api_keys FROM users WHERE telegram_id = $1', [userId]);

          if (dbResult.rows.length > 0) {
            const blinkKey = dbResult.rows[0].api_keys;
            const userData = await fetchUserData(blinkKey);
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

            ctx.editMessageText(message, {
              inline_message_id: ctx.callbackQuery.inline_message_id
            });
          } else {
            ctx.editMessageText("Blink API key not found. Please use /addAPI command to save your Blink API key.", {
              inline_message_id: ctx.callbackQuery.inline_message_id
            });
          }
        } catch (error) {
          console.error('Failed to retrieve balance:', error);
          ctx.reply("Failed to retrieve balance. Please try again.");
        }
        break;

      case 'INVOICE':
        const walletType = data.split('_')[1];
        const amount = parseInt(data.split('_')[2], 10);

        try {
          const userResult = await dbClient.query('SELECT api_keys, walletid_btc, walletid_usd FROM users WHERE telegram_id = $1', [userId]);

          if (userResult.rows.length === 0) {
            ctx.editMessageText("Blink API Key doesn't exist. Please add one.", {
              inline_message_id: ctx.callbackQuery.inline_message_id
            });
            return;
          }

          const walletId = walletType === 'BTC' ? userResult.rows[0].walletid_btc : userResult.rows[0].walletid_usd;
          const apiKey = userResult.rows[0].api_keys;
          const invoiceResponse = await createInvoiceOnBehalfOfRecipient(apiKey, walletType, walletId, amount);

          if (invoiceResponse == null) {
            ctx.editMessageText("Failed to create invoice. Please try again.", {
              inline_message_id: ctx.callbackQuery.inline_message_id
            });
            return;
          }

          const invoiceJSON = invoiceResponse;
          const UUID = uuidv4();
          const query = 'INSERT INTO invoices (invoice_data, invoice_uuid, wallet_type) VALUES ($1, $2, $3)';
          await dbClient.query(query, [invoiceJSON, UUID, walletType]);

          const currencyType = walletType == "BTC" ? "Sats" : "Cents";
          const detailsMessage = `Pay the invoice for amount: ${amount} ${currencyType}\n*Use this code for payment:* \`${UUID}\``;

          ctx.editMessageText(detailsMessage, {
            inline_message_id: ctx.callbackQuery.inline_message_id,
            parse_mode: 'Markdown'
          });
        } catch (error) {
          console.error('Error during invoice creation process', error);
          ctx.editMessageText("Error accessing your data. Please try again later.", {
            inline_message_id: ctx.callbackQuery.inline_message_id
          });
        }
        break;

      default:
        console.log('Unknown action');
        break;
    }
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
    return data.data;
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

function findPaymentRequest(obj) {
  if (obj.hasOwnProperty('paymentRequest')) {
    return obj.paymentRequest;
  }

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];

      if (value !== null && typeof value === 'object') {
        let result = null;

        if (Array.isArray(value)) {
          for (const item of value) {
            result = findPaymentRequest(item);
            if (result !== null) {
              return result;
            }
          }
        } else {
          result = findPaymentRequest(value);
          if (result !== null) {
            return result;
          }
        }
      }
    }
  }

  return null;
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

bot.launch();
