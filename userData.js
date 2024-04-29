const blink="blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ"
const keyID = "	fae0245c-1fe9-4af2-b577-1f43aec3616f"
const walletID = "9deb7d80-43b7-4f74-afdc-79f26d841426";
// type=blink;server=https://api.blink.sv/graphql;api-key=blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ;wallet-id=9deb7d80-43b7-4f74-afdc-79f26d841426

// type=blink;server=https://api.blink.sv/graphql;api-key=blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ;wallet-id=d5830078-990d-4af9-85a1-5abf94c945f6

const username = "fae0245c-1fe9-4af2-b577-1f43aec3616f";
const endpoint = "https://api.blink.sv/graphql";

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function fetchUserData() {
    const url = 'https://api.blink.sv/graphql';
    const headers = {
        'Content-Type': 'application/json',
        'X-API-KEY': 'blink_b9smcZDzPLhLuQuuCuvbChU5r709IJNX63soMUd6I2r0a7GyYmBA8AKUUmPLpBOQ'
    };
    const body = JSON.stringify({
        query: `query Me {
            me {
                defaultAccount {
                    wallets {
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
        console.log("Complete response data:");
        printObject(data, "");
    } catch (error) {
        console.error('Error making the request:', error);
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

//fetchUserData();

