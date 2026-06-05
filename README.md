# Travel Redemption Watcher

Node.js + TypeScript service for tracking hotel and airline award redemptions.

## Run

```bash
npm start
```

Open the dashboard at `http://127.0.0.1:3000/`.

For hotel targets, you can store a public Hilton reservation URL. The app will try the public search flow first using that URL.
Use the dashboard's `Alert contacts` panel to add the WhatsApp numbers that should receive alerts. If no saved contacts exist, the app falls back to `WHATSAPP_TO`.

## Test

```bash
npm test
```

## Environment

- `PORT` - HTTP port, defaults to `3000`
- `DATA_DIR` - storage directory, defaults to `./data`
- `POLL_INTERVAL_HOURS` - scan cadence, defaults to `6`
- `WHATSAPP_MODE` - `meta` or `console`, defaults to `console`
- `WHATSAPP_PHONE_NUMBER_ID` - required for Meta mode
- `WHATSAPP_ACCESS_TOKEN` - required for Meta mode
- `WHATSAPP_TO` - WhatsApp recipient number for Meta mode
