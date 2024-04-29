const blink = "blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ"
const keyID = "	fae0245c-1fe9-4af2-b577-1f43aec3616f"
const walletID = "9deb7d80-43b7-4f74-afdc-79f26d841426";
// type=blink;server=https://api.blink.sv/graphql;api-key=blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ;wallet-id=9deb7d80-43b7-4f74-afdc-79f26d841426

// type=blink;server=https://api.blink.sv/graphql;api-key=blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ;wallet-id=d5830078-990d-4af9-85a1-5abf94c945f6

const username = "fae0245c-1fe9-4af2-b577-1f43aec3616f";
const endpoint = "https://api.blink.sv/graphql";

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function fetchWallets(apiKey) {
    const url = 'https://api.blink.sv/graphql';
    const headers = {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
    };

    const query = `
        query me {
            me {
                defaultAccount {
                    wallets {
                        id
                        walletCurrency
                    }
                }
            }
        }
    `;

    const graphqlData = {
        query: query,
        variables: {}  // Empty variables object, as per your curl command
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(graphqlData)
        });

        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(`HTTP error, status = ${response.status}`);
        }

        // Filter wallets by BTC currency
        const btcWallets = responseData.data.me.defaultAccount.wallets
            .filter(wallet => wallet.walletCurrency === 'BTC')
            .map(wallet => wallet.id);

        console.log('BTC Wallet IDs:', btcWallets);
    } catch (error) {
        console.error('Error fetching wallets:', error);
    }
}

// Replace '<YOUR_AUTH_TOKEN_HERE>' with your actual API key
fetchWallets(blink);
