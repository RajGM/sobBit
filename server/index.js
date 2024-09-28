const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = 3000;
require('dotenv').config();

app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const forward_url = process.env.forward_url;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

// Middleware to log all incoming requests
app.all('*', async (req, res) => {
  // Log request details
  console.log(`Request Method: ${req.method}`);
  console.log(`Request URL: ${req.url}`);
  console.log(`Request Headers: ${JSON.stringify(req.headers)}`);
  console.log(`Request Body: ${JSON.stringify(req.body)}`);

  const authorizationCode = req.query.code;
  const state = req.query.state;

  // Check if code and state exist in the query
  if (authorizationCode && state) {
    // Call the getToken function with the extracted code and state
    const token = await getToken(authorizationCode, state)
    console.log("TOKEN:", token)
    // try {
    //   const response = await axios({
    //     method: req.method,
    //     url: forward_url,
    //     data: token,
    //     timeout: 10000, // 10 seconds timeout
    //   });

    //   // Forward the response status and data
    //   res.status(response.status).send(response.data);
    // } catch (error) {
    //   console.error("Error forwarding request:", error.message);
    //   if (error.response) {
    //     res.status(error.response.status).send(error.response.data);
    //   } else {
    //     res.status(500).send(error.message);
    //   }
    // }

    res.send(`Code and state received. Authorization code: ${authorizationCode}, State: ${state}`);
  } else {
    // If code or state is missing, return an error
    res.status(400).send('Missing code or state in the request');
  }

  // Send a response
  res.send('Request received and logged.');
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

async function getToken(authorizationCode, state) {
  const url = 'https://oauth.staging.blink.sv/oauth2/token';

  // Create the basic auth header value
  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  // Define the body parameters
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', authorizationCode); // Use extracted authorization code
  params.append('redirect_uri', `${CALLBACK_URL}`); // Use fixed callback URL with state

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP error! Status: ${response.status}, Body: ${errorBody}`);
    }

    const data = await response.json();
    console.log('Access Token:', data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}