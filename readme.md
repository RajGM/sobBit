# Blink Bot Documentation

Welcome! This bot allows you to send and receive sats via Blink. Below are the available commands and their descriptions.

## Commands

### `/start` or `/help`
Show all available commands.

---

### `/addAPI`
Add or replace your existing Blink API key using the OAuth2 flow.

---

### `/balance`
Displays the balances in your Blink wallet.

---

### `/createInvoice <walletType> <amount>`
Creates an invoice in your Blink wallet.

- **Parameters**:
- `<walletType>`: The type of wallet (`BTC` or `USD`).
- `<amount>`: The amount to include in the invoice(sats for BTC and cents for USD).

---

### `/pay <walletType> <paymentRequest>`
Pays the specified invoice using your Blink wallet.

- **Parameters**:
- `<walletType>`: The type of wallet (`BTC` or `USD`).
- `<paymentRequest>`: The payment request to complete the payment.

---

## Notes
- Make sure to add or replace your Blink API key using `/addAPI` before using other commands.
- Ensure you specify the correct wallet type (`BTC` or `USD`) and valid amounts or payment requests as required.

Happy transacting with Blink!
