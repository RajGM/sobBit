const blink = "blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ"
const keyID = "	fae0245c-1fe9-4af2-b577-1f43aec3616f"
const walletID = "9deb7d80-43b7-4f74-afdc-79f26d841426";
// type=blink;server=https://api.blink.sv/graphql;api-key=blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ;wallet-id=9deb7d80-43b7-4f74-afdc-79f26d841426

// type=blink;server=https://api.blink.sv/graphql;api-key=blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ;wallet-id=d5830078-990d-4af9-85a1-5abf94c945f6

const username = "fae0245c-1fe9-4af2-b577-1f43aec3616f";
const endpoint = "https://api.blink.sv/graphql";

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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

const paymentRequest = "lnbc10n1pnzua9rpp5ef77y3aka53gn0nc9rawerekrkpu6f96pts69vvgcqc0hjc4m2xqdqqcqzpuxqyz5vqsp5w5jguvzhj9ud8gazfpqsm8tzsdyq4rc5jsnce2xp7rhtg6ulxxds9qyyssqrk880daqhulepxpuvvpw78r6fjv9r3a45dv6j0xhs395uv5m0aqydtdfamlvk0nwunsecsncjh8crcla29mgusakyec8zuy5u3gr8uspk8ml5j"

// Example call to the function
sendInvoicePayment(blink, paymentRequest, walletID);
