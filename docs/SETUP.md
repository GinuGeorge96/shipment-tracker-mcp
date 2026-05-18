# Setup & Testing Guide

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | v18 or higher |
| npm | v9 or higher |
| OS | Windows / macOS / Linux |

> **No Claude subscription required** to run or test this server. See [Testing](#7-test-the-tool) below.

---

## 1. Clone the Repository

```bash
git clone https://github.com/GinuGeorge96/shipment-tracker-mcp.git
cd shipment-tracker-mcp
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Install Playwright Browser

The server uses Chromium to handle the DSV tracking portal's CAPTCHA flow.

```bash
npx playwright install chromium
```

---

## 4. Configure Environment (Optional)

```bash
cp .env.example .env
```

Edit `.env` to override defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `HEADLESS` | `true` | Run browser headlessly. Set to `false` to watch the browser during debugging. |
| `BROWSER_TIMEOUT_MS` | `15000` | Max time (ms) to wait for a tracking response. |
| `MAX_RETRIES` | `1` | Number of retry attempts on transient errors. |

---

## 5. Build

Compiles TypeScript to `dist/`:

```bash
npm run build
```

---

## 6. Run the MCP Server

```bash
npm start
```

Expected output:
```
{"level":"info","message":"Shipment Tracker MCP server started","timestamp":"..."}
```

The server listens on **stdout** for MCP protocol messages. Logs go to **stderr**.

> **Note:** Running `npm start` directly keeps the server idle waiting for an MCP client — this is expected behaviour. Use the test options below to verify it works.

---

## 7. Test the Tool

There are three ways to test — **no Claude subscription required** for the first two.

---

### Option A: MCP Inspector (recommended)

Anthropic's free CLI tool for testing MCP servers interactively — tests the full MCP protocol stack, exactly as a real client would.

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Opens a browser UI at `http://localhost:5173`:
1. Click **List Tools** — you should see `track_shipment`
2. Click **`track_shipment`**
3. Enter `1806290829` in the `referenceNumber` field
4. Click **Run**

---

### Option B: Built-in test script (quick smoke test)

Tests the core tracking logic directly — fastest way to verify the scraper works.

```bash
# Single reference number
npm run test:tracker:ref -- 1806290829

# Batch test multiple references
npm run test:tracker
```

Expected output:
```
Testing 1 reference(s)...

─── 1806290829 ───
✓ OK
  Sender:   Sjuntorp, SE
  Receiver: Dourges, FR
  Packages: 2
  Events:   10
```

---

### Option C: Claude Desktop or Claude Code (requires Claude subscription)

If you have access to Claude Desktop or Claude Code, connect the server as an MCP tool:

**Claude Desktop**

Edit the config file:
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "shipment-tracker": {
      "command": "node",
      "args": ["C:/absolute/path/to/shipment-tracker-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then ask:
```
Track shipment 1806290829
```

**Claude Code**

Add to `.claude/settings.json` in your project:

```json
{
  "mcpServers": {
    "shipment-tracker": {
      "command": "node",
      "args": ["C:/absolute/path/to/shipment-tracker-mcp/dist/index.js"]
    }
  }
}
```

---

## 8. Development Mode

Run with hot reload (no build step needed):

```bash
npm run dev
```

To watch the browser during development, set `HEADLESS=false` in your `.env`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Shipment not found` | Reference number may have expired. Use `1806290829` which is confirmed working. |
| `Timeout` error | Network may be slow. Increase `BROWSER_TIMEOUT_MS` in `.env`. |
| `Cannot find module` | Run `npm run build` first. |
| Playwright install error | Run `npx playwright install chromium --with-deps` |
