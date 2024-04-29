require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    password: '+yjrT>l0Aq)lN.SN*R.2T4JBg.wI',
    host: 'database-1.c1ssqkwwal5k.ap-south-1.rds.amazonaws.com',
    database: 'database-1',
    port: 5432
});

async function setupDatabase() {
    try {
      // Create table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS test (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255),
            email VARCHAR(255)
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
      const res = await pool.query('SELECT * FROM test');
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
    const res = await pool.query('SELECT NOW()');
    console.log('Current time:', res.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await pool.end(); // Close the pool connection when done
  }
}


//queryDatabase();
setupDatabase();
