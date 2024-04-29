const blink = "blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ"
const keyID = "	fae0245c-1fe9-4af2-b577-1f43aec3616f"
const walletID = "9deb7d80-43b7-4f74-afdc-79f26d841426";
// type=blink;server=https://api.blink.sv/graphql;api-key=blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ;wallet-id=9deb7d80-43b7-4f74-afdc-79f26d841426

// type=blink;server=https://api.blink.sv/graphql;api-key=blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ;wallet-id=d5830078-990d-4af9-85a1-5abf94c945f6

const username = "fae0245c-1fe9-4af2-b577-1f43aec3616f";
const endpoint = "https://api.blink.sv/graphql";

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

//this is usd invoice 
async function createInvoice() {
  const url = 'https://api.mainnet.galoy.io/graphql';
  const headers = {
    'Content-Type': 'application/json',
    'X-API-KEY': 'blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ'
  };

  const query = `
    mutation lnUsdInvoiceCreate($input: LnUsdInvoiceCreateInput!) {
      lnUsdInvoiceCreate(input: $input) {
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

  const variables = {
    input: {
      walletId: "d5830078-990d-4af9-85a1-5abf94c945f6", // You need to provide a valid wallet ID here
      amount: 1,
      memo: "Test"
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
     // Check if the invoice data is null and errors are present
     if (responseData.data.lnUsdInvoiceCreate.invoice === null && responseData.data.lnUsdInvoiceCreate.errors.length > 0) {
        console.error('Errors returned from the API:', responseData.data.lnUsdInvoiceCreate.errors);
        responseData.data.lnUsdInvoiceCreate.errors.forEach((error, index) => {
            console.error(`Error ${index + 1}:`, error.message);
        });
    } else {
        console.log('Invoice created successfully:', responseData.data.lnUsdInvoiceCreate.invoice);
    }
  } catch (error) {
    console.error('Error making request:', error);
  }
}

//createInvoice();

async function createInvoiceOnBehalfOfRecipient(apiKey, recipientWalletId, amount) {
    const url = 'https://api.blink.sv/graphql';
    const headers = {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey  // Replace '<YOUR_AUTH_TOKEN_HERE>' with your actual API key
    };

    const query = `
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

    const variables = {
        input: {
            amount: amount,  // The amount for the invoice, as a string
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
            throw new Error(`HTTP error, status = ${response.status}, message = ${JSON.stringify(responseData)}`);
        }

        console.log('Invoice Creation Result:', responseData.data.lnInvoiceCreateOnBehalfOfRecipient);
    } catch (error) {
        console.error('Error creating invoice:', error);
    }
}

//rajgmdevelop19@gmail.com account
const apiKey2 = "blink_GAOUo9326FIjCvZIwP8rIz9bZyiAhdUkohw2WpCEPwtSOwYwS3j5cRvLfX74qmvJ"
const keyID2 = "9f4ef4f0-3db6-4b3b-bd45-1b810ff99bc5";
const usdWalletID2 = "49a04a7a-472e-4a5a-a58f-c4aef48818b0";
const btcWallerID2 = "ca2fc4ab-4ab0-4aa2-b5ac-81530decba1a";

// Example call to the function
createInvoiceOnBehalfOfRecipient(apiKey2, btcWallerID2, '1');
