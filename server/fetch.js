const { Client } = require('pg');

// PostgreSQL connection setup
const client = new Client({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'postgres',
    password: process.env.PGPASSWORD || 'mysecretpassword',
    port: process.env.PGPORT || 5432,
});

async function fetchAllUsers() {
    try {
        await client.connect();
        console.log('Connected to PostgreSQL');

        // Query to fetch all users
        const res = await client.query('SELECT * FROM users');

        if (res.rows.length === 0) {
            console.log('No users found in the "users" table.');
        } else {
            console.log('User information:');
            res.rows.forEach(user => {
                console.log("Created Time (UTC):", user.created);
                const isValid = isLessThanFiftyMinutes(user.created);
                console.log("Is Token Valid (less than 50 minutes):", isValid);
                console.log(`Telegram ID: ${user.telegramid}, Token: ${user.token}, Created: ${user.created}`);
            });
        }

    } catch (err) {
        console.error('Error fetching users:', err);
    } finally {
        await client.end();
        console.log('PostgreSQL client disconnected');
    }
}

fetchAllUsers();

function isLessThanFiftyMinutes(createdTime) {
    // Convert 'createdTime' to a JavaScript Date object in UTC
    const createdDate = new Date(createdTime);
  
    // Get current time in UTC by using `Date.now()` (returns milliseconds since the epoch in UTC)
    const currentTime = Date.now();
  
    // Calculate the time difference in milliseconds
    const timeDifference = currentTime - createdDate.getTime();
  
    // Convert 50 minutes to milliseconds (50 minutes * 60 seconds * 1000 ms)
    const fiftyMinutesInMs = 50 * 60 * 1000;
  
    // Return true if less than 50 minutes have passed, else false
    return timeDifference < fiftyMinutesInMs;
  }