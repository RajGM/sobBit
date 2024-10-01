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
  CREATE TABLE IF NOT EXISTS users (
    telegramId VARCHAR(255) PRIMARY KEY,
    token VARCHAR(255)
  );
`;

async function initializeDB() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');
    
    // Check if the table exists, and if not, create it
    await client.query(createTableQuery);
    console.log('Table "users" is ready');
  } catch (err) {
    console.error('Error creating table', err);
  } finally {
    await client.end();
    console.log('PostgreSQL client disconnected');
  }
}

initializeDB();
