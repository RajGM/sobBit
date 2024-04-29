//require('dotenv').config();
const { Pool } = require('pg');

// Connection configuration
const pool = new Pool({
  user: 'postgres', // default superuser
  host: 'localhost', // Docker forwards this to your container
  database: 'postgres', // default database
  password: 'mysecretpassword', // the password you specified
  port: 5432, // the port you forwarded
});


async function setupDatabase() {
    try {
      // Create table
      await pool.query(`
      CREATE TABLE users (
        user_id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE,
        api_keys TEXT,
        wallet_id TEXT,
        balance DECIMAL
      );
      `);
      console.log('Table created.');
  
      // Insert dummy data
      await pool.query(`
        INSERT INTO test (name, email) VALUES
        ('Alice', 'alice@example.com'),
        ('Bob', 'bob@example.com'),
        ('Charlie', 'charlie@example.com');
      `);
      console.log('Dummy data inserted.');
  
      // Fetch all data
      const res = await pool.query('SELECT * FROM users');
      console.log('Data fetched:', res.rows);
    } catch (err) {
      console.error('Error executing operations', err.stack);
    } finally {
      await pool.end(); // Ensure that the pool is closed after the operations
    }
}

async function queryDatabase() {
  try {
    // Example query to get the current time
    const res = await pool.query('SELECT * FROM users');
    console.log('Data fetched:', res.rows);
  } catch (err) {
    console.error('Error executing operations', err.stack);
  } finally {
    await pool.end(); // Ensure that the pool is closed after the operations
  }
}


setupDatabase();
//queryDatabase();
