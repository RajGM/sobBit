const { Client } = require('pg');

// PostgreSQL connection setup
const client = new Client({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'postgres',
  password: process.env.PGPASSWORD || 'mysecretpassword',
  port: process.env.PGPORT || 5432,
});

const createTableQuery = `
  CREATE TABLE users (
  telegramId BIGINT PRIMARY KEY,     -- Unique Telegram user ID
  api_keys VARCHAR(255),             -- API key for accessing Blink services
  walletid_btc VARCHAR(255),         -- Wallet ID for BTC wallet
  walletid_usd VARCHAR(255),         -- Wallet ID for USD wallet
  token VARCHAR(255),                -- Oauth2 token
  created TIMESTAMP DEFAULT NOW()    -- Time when the record was created
);
`;

const alterTableQuery = `
  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL;
`;

const insertUserQuery = `
  INSERT INTO users (telegramId, token, created)
  VALUES ($1, $2, NOW())
  ON CONFLICT (telegramId) 
  DO UPDATE SET token = EXCLUDED.token, created = NOW();
`;

const user = {
  telegramId: '5623914798',
  token: 'ory_at_drpjdX0HRzqq5YgsxDuxuFgZG_2G5OE6iE2xHDQhXck.pb0Xrhnt1z-dgMsvdwO94CNVdy2wsk82eDRk23i63zo'
};

async function initializeDB() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Create the table if it doesn't exist
    await client.query(createTableQuery);
    console.log('Table "users" is ready');

    // Alter the table to ensure "created" is not empty
    await client.query(alterTableQuery);
    console.log('Column "created" ensured in "users" table');

    // Insert the user with token and update on conflict (also updating "created" timestamp)
    await client.query(insertUserQuery, [user.telegramId, user.token]);
    console.log(`User ${user.telegramId} added/exists in the database`);

    // Retrieve and log all users
    const res = await client.query('SELECT * FROM users');
    if (res.rows.length === 0) {
      console.log('No users found in the "users" table.');
    } else {
      console.log('User information:');
      res.rows.forEach(user => {
        console.log(`Telegram ID: ${user.telegramId}, Token: ${user.token}, Created: ${user.created}`);
      });
    }

  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    await client.end();
    console.log('PostgreSQL client disconnected');
  }
}

initializeDB();
