import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { logger } from './logger.js'

let browser: Browser | null = null

const BROWSER_TIMEOUT_MS = parseInt(process.env['BROWSER_TIMEOUT_MS'] ?? '15000', 10)
const HEADLESS = process.env['HEADLESS'] !== 'false'

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    logger.info('Launching browser')
    browser = await chromium.launch({ headless: HEADLESS })
  }
  return browser
}

export async function newContext(): Promise<BrowserContext> {
  const b = await getBrowser()
  return b.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    locale: 'en-US',
    extraHTTPHeaders: {
      'accept-language': 'en-US,en;q=0.9',
    },
  })
}

export async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  page.setDefaultTimeout(BROWSER_TIMEOUT_MS)
  return page
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    logger.info('Closing browser')
    await browser.close()
    browser = null
  }
}
