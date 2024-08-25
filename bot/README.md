# Blink Telegram Bot

## Overview
This Blink Telegram Bot enables users to interact with Blink's API through Telegram. It supports functionalities like managing API keys, checking wallet balances, creating invoices, and processing payments—all through a simple Telegram interface.

## Features
- **API Key Management**: Add or update Blink API keys for user authentication.
- **Wallet Balance Checking**: View the balance of BTC and USD wallets.
- **Invoice Creation**: Generate invoices specifying wallet type and amount.
- **Payment Processing**: Pay invoices using unique invoice IDs.

## Prerequisites
- Node.js
- npm or yarn
- PostgreSQL
- Telegram account and bot token
- Access to Blink API

## Setup Instructions

### Environment Setup
1. **Install Node.js and npm**:
   - Download and install Node.js from [Node.js official website](https://nodejs.org/).
   - npm is installed with Node.js by default.
2. **Clone the repository**:
   - Use the following command to clone the repository:
     ```
     git clone [https://github.com/RajGM/sobBit]
     cd [sobBit]
     ```

3. **Install dependencies**:
```
npm install
```

4. **Set up environment variables:**
Create a .env file in the root directory.
Add the following lines, replacing placeholders with actual values
```
BOTKEY=your_telegram_bot_token
```

## Usage
- Start the bot by running:

node index.js


- Use the following commands in your Telegram chat with the bot:
- `/start` or `/help`: Show all available commands.
- `/addAPI apiKey`: Add or replace the existing Blink APIKey.
- `/balance`: Shows the balances in your Blink wallet.
- `/createInvoice walletType amount`: Creates an invoice.
- `/pay uuid`: Pay the invoice using the invoiceID.

## Contributing
Contributions to the Blink Telegram Bot are welcome. Please ensure to follow the existing code style and add unit tests for any new or changed functionality.

## License
Specify the license under which your project is available. Common licenses for open source projects include MIT, GPL, and Apache.
