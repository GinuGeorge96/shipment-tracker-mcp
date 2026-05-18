# Architecture & Design Decisions

## Overview

This MCP server exposes a single tool — `track_shipment` — that accepts a DB Schenker reference number and returns structured shipment data. The core challenge is that the data source (DSV tracking portal) is a JavaScript-rendered SPA with CAPTCHA protection, not a simple REST API.

---

## System Architecture

```
Claude (MCP Client)
       │
       │  MCP Protocol (stdio)
       ▼
  MCP Server (index.ts)
       │
       ▼
  MCP Tool (trackShipment.ts)
       │
       ▼
  Tracking Service (dbschenker.ts)
       │
       ├── Browser Utility (browser.ts)
       │        │
       │        ▼
       │   Playwright Chromium
       │        │
       │        ▼
       │   DSV Tracking Portal
       │   mydsv.dsv.com
       │
       ├── Error Handling (errors.ts)
       ├── Logger (logger.ts)
       └── Schema Validation (schemas/shipment.ts)
```

---

## Two-Step API Discovery

The DSV tracking portal makes two sequential API calls internally:

```
Step 1: GET /shipments?query=<refNumber>
        → Returns summary: { result: [{ id, stt, fromLocation, toLocation, ... }] }

Step 2: GET /shipments/land/<id>
        → Returns full detail: { sttNumber, goods, events, packages, location, ... }
```

We intercept both using `page.on('response')` and select the detail response for normalization. The `id` from Step 1 is automatically used by the page's own JS to trigger Step 2 — we don't need to construct it manually.

---

## CAPTCHA Handling

The portal uses a custom proof-of-work CAPTCHA system ("Endor"):

```
Our request → 429 + captcha-puzzle header (base64 JWT, ~100s TTL)
                    ↓
           Page JS solves puzzle automatically
                    ↓
Retry request → captcha-solution header → 200 / 404
```

**Decision:** We let the browser handle CAPTCHA solving naturally rather than reverse-engineering the puzzle algorithm. This is more maintainable — if the CAPTCHA algorithm changes, our code doesn't break.

**Implementation:** `waitForResponse` filters out 429 responses and waits for the final result:
```typescript
page.waitForResponse(
  (r) => r.url().includes(API_PATTERN) && r.status() !== 429
)
```

---

## Browser Management

```
Browser (singleton — one per MCP server lifetime)
  └── Context (new per request attempt)
       └── Page (new per request)
```

- **Browser singleton:** Avoids cold start overhead on every tool call (~2s savings)
- **New context per attempt:** Clean cookies/storage on retry, no session bleed
- **New page per request:** Isolated navigation state

---

## Retry Policy

Only transient errors are retried. Deterministic errors fail immediately.

| Status | Classification | Reason |
|--------|---------------|--------|
| 429 | Retry (max 1) | Rate limited — transient |
| 408 | Retry (max 1) | Timeout — transient |
| Network error | Retry (max 1) | Connection blip — transient |
| 200 + empty body | Retry (max 1) | Unexpected, possibly transient |
| 404 | Fail fast | Shipment does not exist |
| 200 + invalid schema | Fail fast | API shape changed — code bug, not transient |
| Unknown status | Fail fast | Don't retry what you don't understand |

**Why max 1 retry?** More retries risk hammering a rate-limited endpoint. One retry handles the common case (brief rate limit) without abuse.

---

## Partial Data Handling

Instead of failing when some fields are missing, we return what we have with warnings:

```json
{
  "referenceNumber": "...",
  "sender": { "name": "Unknown", "city": "Sjuntorp" },
  "warnings": ["Detailed sender information unavailable"]
}
```

This mirrors production resilience patterns — partial data is more useful than no data.

---

## Response Validation

All API responses are validated with Zod before normalization:

```typescript
const result = ShipmentSchema.safeParse(rawData)
if (!result.success) {
  throw new SchemaValidationError(result.error.message)
}
```

This protects against:
- Upstream API shape changes
- Unexpected null/undefined fields
- Type coercion bugs in normalization

---

## Logging Strategy

All logs go to **stderr**, never stdout.

**Why:** MCP servers communicate over stdout using the MCP protocol. Writing logs to stdout would corrupt the protocol stream and break the client connection.

Logs are structured JSON for easy parsing:
```json
{"level":"info","message":"Tracking attempt","timestamp":"...","context":{"referenceNumber":"...","attempt":1}}
```

---

## Project Structure

```
src/
├── index.ts              # MCP server bootstrap and tool registration
├── tools/
│    └── trackShipment.ts # MCP tool definition, input validation, error formatting
├── services/
│    └── dbschenker.ts    # Core tracking logic, retry policy, response normalization
├── schemas/
│    └── shipment.ts      # Zod schemas — single source of truth for data shapes
├── utils/
│    ├── browser.ts       # Playwright singleton, context/page factory
│    ├── errors.ts        # Typed error hierarchy with retryable flag
│    └── logger.ts        # Structured stderr logger
└── types/
     └── shipment.ts      # TypeScript interfaces derived from Zod schemas
```

---

## Trade-offs & Alternatives

### Playwright vs Direct HTTP

| | Playwright | Direct HTTP |
|--|-----------|-------------|
| CAPTCHA | Handled automatically | Must reverse-engineer proof-of-work algorithm |
| Speed | ~3-5s per request | ~1s per request |
| Maintenance | Robust to CAPTCHA changes | Breaks if CAPTCHA algorithm changes |
| Dependencies | Chromium (~150MB) | None |

**We chose Playwright** because the CAPTCHA algorithm is complex and undocumented. Reverse-engineering it would be brittle — any update to the algorithm would break our implementation. Playwright's overhead (~3-5s) is acceptable for a tracking use case.

### Official DSV API vs Web Scraping

The official DSV API (developer.dsv.com) requires OAuth authentication and a DSV account. The challenge specifically asks to use the **public** tracking website, making web scraping the correct approach.

### waitForResponse vs page.on('response')

`waitForResponse` is promise-based and registered before navigation, eliminating race conditions where a response fires before the listener is ready. `page.on('response')` is passive and works well for collecting multiple responses — we use both.
