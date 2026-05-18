# shipment-tracker-mcp

An MCP (Model Context Protocol) server that tracks DB Schenker shipments via the DSV public tracking portal.

## What It Does

Exposes a single MCP tool — `track_shipment` — that accepts a DB Schenker reference number and returns structured shipment data:

- Sender and receiver information
- Package details (weight, dimensions, piece count)
- Complete tracking history
- Per-package tracking events (bonus)

## Tech Stack

| Layer | Tool |
|-------|------|
| Language | TypeScript |
| Runtime | Node.js |
| MCP Framework | `@modelcontextprotocol/sdk` (official Anthropic SDK) |
| Browser Automation | `playwright` (Chromium) |
| Schema Validation | `zod` |

## Quick Start

```bash
git clone https://github.com/GinuGeorge96/shipment-tracker-mcp.git
cd shipment-tracker-mcp
npm install
npx playwright install chromium
npm run build
npm start
```

>  Run `npx @modelcontextprotocol/inspector node dist/index.js` to test the full MCP protocol in a browser UI. See [docs/SETUP.md](docs/SETUP.md) for full instructions.

## Example Response

```json
{
  "referenceNumber": "1806290829",
  "sender": { "name": "Sjuntorp", "city": "Sjuntorp", "postalCode": "46178", "countryCode": "SE" },
  "receiver": { "name": "Dourges", "city": "Dourges", "postalCode": "62119", "countryCode": "FR" },
  "packages": [
    {
      "packageId": "573313432170044780",
      "weight": 800,
      "weightUnit": "KGS",
      "pieceCount": 2,
      "trackingEvents": [...]
    }
  ],
  "trackingHistory": [
    { "timestamp": "2025-12-11T07:22:00Z", "description": "Booked", "location": "Vänersborg", "status": "ENT" },
    { "timestamp": "2025-12-11T14:50:00Z", "description": "Collected", "location": "Sjuntorp", "status": "COL" },
    { "timestamp": "2025-12-18T10:11:00Z", "description": "Delivered", "location": "Dourges", "status": "DLV" }
  ]
}
```

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/SETUP.md](docs/SETUP.md) | Environment setup, build, run, connect to Claude, test |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, CAPTCHA handling, retry policy, trade-offs |

## License

MIT
