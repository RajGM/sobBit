const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Base route using app.route()
app.route('/')
  .get((req, res) => {
    console.log(`Received GET request: ${req.url}`);
    console.log('Headers:', req.headers);
    res.send('GET request received and logged.');
  })
  .post((req, res) => {
    console.log(`Received POST request: ${req.url}`);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);

    res.send('POST request received and logged.');
  });

// Error handling middleware for aborted requests
app.use((err, req, res, next) => {
  if (err && err.code === 'ECONNABORTED') {
    console.error('Request aborted:', err);
    return res.status(400).send('Request was aborted');
  }
  next(err);
});

app.listen(port, () => {
  console.log(`Dummy server is running on http://localhost:${port}`);
});
