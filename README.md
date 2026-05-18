# shipment-tracker-mcp

An MCP (Model Context Protocol) server that tracks DB Schenker shipments via the DSV public tracking portal.

## Overview

This server exposes a single MCP tool — `track_shipment` — that accepts a DB Schenker reference number and returns structured shipment data including sender, receiver, package details, and full tracking history.

## Tech Stack

| Layer | Tool |
|-------|------|
| Language | TypeScript |
| Runtime | Node.js |
| MCP Framework | `@modelcontextprotocol/sdk` (official Anthropic SDK) |
| Browser Automation | `playwright` (Chromium) |
| Schema Validation | `zod` |

## Prerequisites

- Node.js v18 or higher
- npm v9 or higher

## Setup

**1. Clone the repository**

```bash
git clone https://github.com/GinuGeorge96/shipment-tracker-mcp.git
cd shipment-tracker-mcp
```

**2. Install dependencies**

```bash
npm install
```

**3. Install Playwright browsers**

```bash
npx playwright install chromium
```

**4. Configure environment (optional)**

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `HEADLESS` | `true` | Run browser in headless mode |
| `BROWSER_TIMEOUT_MS` | `15000` | Response timeout in milliseconds |
| `MAX_RETRIES` | `1` | Maximum retry attempts |

**5. Build**

```bash
npm run build
```

## Running the Server

**Production:**
```bash
npm start
```

**Development (with hot reload):**
```bash
npm run dev
```

## Connecting to Claude Desktop

Add the following to your Claude Desktop config file:

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "shipment-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/shipment-tracker-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after saving the config.

## Connecting to Claude Code

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "shipment-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/shipment-tracker-mcp/dist/index.js"]
    }
  }
}
```

## Testing the Tool

Use these reference numbers for testing:

| Reference Number |
|-----------------|
| 1806290829 |
| 1806273700 |
| 1806272330 |
| 1806271886 |
| 1806270433 |
| 1806268072 |
| 1806267579 |
| 1806264568 |
| 1806258974 |
| 1806256390 |

Once connected, ask Claude:

```
Track shipment 1806290829
```

## Example Response

```json
{
  "referenceNumber": "1806290829",
  "sender": {
    "name": "Sender Company",
    "street": "Example Street 1",
    "city": "Stockholm",
    "postalCode": "11122",
    "countryCode": "SE"
  },
  "receiver": {
    "name": "Receiver Company",
    "street": "Destination Road 5",
    "city": "Berlin",
    "postalCode": "10115",
    "countryCode": "DE"
  },
  "packages": [
    {
      "packageId": "PKG-001",
      "weight": 12.5,
      "weightUnit": "KG",
      "pieceCount": 1
    }
  ],
  "trackingHistory": [
    {
      "timestamp": "2026-05-17T10:30:00Z",
      "description": "Shipment picked up",
      "location": "Stockholm",
      "status": "PICKED_UP"
    }
  ]
}
```

## Error Handling

| Error | Meaning | Retried? |
|-------|---------|---------|
| `SHIPMENT_NOT_FOUND` | Reference number does not exist | No |
| `RATE_LIMITED` | Too many requests (429) | Yes, once |
| `TIMEOUT` | Response took too long | Yes, once |
| `NETWORK_ERROR` | Could not reach tracking service | Yes, once |
| `SCHEMA_VALIDATION_FAILED` | Unexpected API response shape | No |
| `INVALID_RESPONSE` | Non-JSON or empty response | No |

## Project Structure

```
src/
├── index.ts                  # MCP server entry point
├── tools/
│    └── trackShipment.ts     # MCP tool definition
├── services/
│    └── dbschenker.ts        # Tracking logic and response normalization
├── schemas/
│    └── shipment.ts          # Zod validation schemas
├── utils/
│    ├── browser.ts           # Playwright browser singleton
│    ├── errors.ts            # Custom error classes
│    └── logger.ts            # Structured stderr logger
└── types/
     └── shipment.ts          # TypeScript interfaces
```

## Design Decisions

**Why Playwright over direct HTTP requests?**  
The DSV tracking portal uses a proof-of-work CAPTCHA system ("Endor"). The first request returns a `captcha-puzzle` header; the browser's own JavaScript solves it automatically and retries with a `captcha-solution` header. Rather than reverse-engineering this algorithm, Playwright lets the page's legitimate session flow handle it naturally — making the solution more maintainable and less brittle.

**Why `waitForResponse` over `page.on('response')`?**  
`waitForResponse` is promise-based and registered before navigation, which avoids race conditions where the response fires before the listener is ready.

**Why Zod validation on the scraped response?**  
The API shape could change without notice. Zod `.safeParse()` catches unexpected shapes immediately with a clear `SCHEMA_VALIDATION_FAILED` error rather than a confusing downstream crash.

**Why partial data with warnings instead of all-or-nothing?**  
If the API returns a shipment but is missing tracking history, returning what we have with a warning is more useful than failing entirely. This mirrors production resilience patterns.

**Why classify errors before retrying?**  
Blind retries waste time and hammer rate limits. We only retry transient errors (429, timeout, network) and fail fast on deterministic ones (404, schema mismatch). A schema mismatch is a code bug — retrying won't fix it.

**Why log to stderr?**  
MCP servers communicate over stdout. Logging to stdout would corrupt the protocol stream. All structured logs go to stderr.

## License

MIT
