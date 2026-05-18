import { newContext, newPage } from '../utils/browser.js'
import { logger } from '../utils/logger.js'
import {
  ShipmentNotFoundError,
  RateLimitedError,
  NetworkError,
  TimeoutError,
  InvalidResponseError,
  TrackingError,
} from '../utils/errors.js'
import type { ShipmentData, Address, TrackingEvent, Package } from '../types/shipment.js'

const TRACKING_PAGE_URL = 'https://mydsv.dsv.com/app/tracking-public'
const API_PATTERN = '/nges-portal/api/public/tracking-public/shipments'
const RESPONSE_TIMEOUT_MS = 15000

const RETRY_POLICY = {
  maxRetries: 1,
  retryOn: new Set([429, 408, 0]),
  failFast: new Set([404, 400, 422]),
} as const

function isNetworkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('net::') || error.message.includes('ERR_'))
  )
}

function classifyStatus(status: number): 'success' | 'retry' | 'fail_fast' {
  if (status === 200) return 'success'
  if (RETRY_POLICY.retryOn.has(status as never)) return 'retry'
  if (RETRY_POLICY.failFast.has(status as never)) return 'fail_fast'
  return 'fail_fast'
}

function normalizeAddress(raw: Record<string, unknown>): Address {
  const addressRaw = (raw['address'] as Record<string, unknown>) ?? raw
  return {
    name: String(raw['name'] ?? raw['companyName'] ?? ''),
    street: String(addressRaw['street'] ?? addressRaw['streetName'] ?? ''),
    city: String(addressRaw['city'] ?? ''),
    postalCode: String(addressRaw['postalCode'] ?? addressRaw['zipCode'] ?? ''),
    countryCode: String(addressRaw['countryCode'] ?? addressRaw['country'] ?? ''),
  }
}

function normalizeEvent(raw: Record<string, unknown>): TrackingEvent {
  return {
    timestamp: String(raw['eventDateTime'] ?? raw['timestamp'] ?? raw['date'] ?? ''),
    description: String(raw['description'] ?? raw['eventDescription'] ?? raw['eventCode'] ?? ''),
    location: String(raw['location'] ?? raw['locationName'] ?? raw['place'] ?? ''),
    status: String(raw['status'] ?? raw['eventCode'] ?? ''),
  }
}

function normalizePackage(raw: Record<string, unknown>): Package {
  const dims = raw['dimensions'] as Record<string, unknown> | undefined
  const weight = raw['grossWeight'] as Record<string, unknown> | undefined
  const events = Array.isArray(raw['events']) ? raw['events'] : []

  return {
    packageId: String(raw['packageNumber'] ?? raw['packageId'] ?? raw['id'] ?? ''),
    weight: Number(weight?.['value'] ?? raw['weight'] ?? 0) || undefined,
    weightUnit: String(weight?.['unit'] ?? raw['weightUnit'] ?? 'KG'),
    dimensions: dims
      ? {
          length: Number(dims['length']) || undefined,
          width: Number(dims['width']) || undefined,
          height: Number(dims['height']) || undefined,
          unit: String(dims['unit'] ?? 'CM'),
        }
      : undefined,
    pieceCount: Number(raw['pieceCount'] ?? raw['quantity'] ?? 1) || undefined,
    trackingEvents: events.map((e) => normalizeEvent(e as Record<string, unknown>)),
  }
}

function normalizeShipment(raw: unknown, referenceNumber: string): ShipmentData {
  const warnings: string[] = []
  const data = raw as Record<string, unknown>

  // Detail response has sttNumber + goods + events + location
  if ('sttNumber' in data || 'goods' in data) {
    return normalizeDetailResponse(data, referenceNumber)
  }

  // Search response fallback: { result: [...] }
  const results = Array.isArray(data['result']) ? data['result'] : []
  const shipment = (results[0] ?? data) as Record<string, unknown>
  const fromCity = String(shipment['fromLocation'] ?? '')
  const toCity = String(shipment['toLocation'] ?? '')
  const lastEvent = String(shipment['lastEventCode'] ?? '')
  const endDate = String(shipment['endDate'] ?? shipment['startDate'] ?? '')

  warnings.push('Only summary data available — full detail call did not complete')

  return {
    referenceNumber,
    sender: { name: 'Unknown', city: fromCity },
    receiver: { name: 'Unknown', city: toCity },
    packages: [],
    trackingHistory: lastEvent
      ? [{ timestamp: endDate, description: lastEvent, status: lastEvent }]
      : [],
    warnings,
  }
}

function normalizeDetailResponse(data: Record<string, unknown>, referenceNumber: string): ShipmentData {
  const warnings: string[] = []

  const location = data['location'] as Record<string, unknown> | undefined
  const goods = data['goods'] as Record<string, unknown> | undefined
  const eventsRaw = Array.isArray(data['events']) ? data['events'] : []
  const packagesRaw = Array.isArray(data['packages']) ? data['packages'] : []

  const shipperPlace = location?.['shipperPlace'] as Record<string, unknown> | undefined
  const consigneePlace = location?.['consigneePlace'] as Record<string, unknown> | undefined

  if (!shipperPlace) warnings.push('Sender information unavailable')
  if (!consigneePlace) warnings.push('Receiver information unavailable')
  if (eventsRaw.length === 0) warnings.push('Tracking history unavailable')

  const weight = goods?.['weight'] as Record<string, unknown> | undefined

  const packages: Package[] = packagesRaw.map((p) => {
    const pkg = p as Record<string, unknown>
    const pkgEvents = Array.isArray(pkg['events']) ? pkg['events'] : []
    return {
      packageId: String(pkg['id'] ?? ''),
      weight: Number(weight?.['value'] ?? 0) || undefined,
      weightUnit: String(weight?.['unit'] ?? 'KGS'),
      pieceCount: Number(goods?.['pieces'] ?? 1) || undefined,
      trackingEvents: pkgEvents.map((e) => {
        const ev = e as Record<string, unknown>
        return {
          timestamp: String(ev['date'] ?? ''),
          description: String(ev['code'] ?? ''),
          location: String(ev['location'] ?? ''),
          status: String(ev['code'] ?? ''),
        }
      }),
    }
  })

  return {
    referenceNumber,
    sender: shipperPlace
      ? {
          name: String(shipperPlace['city'] ?? 'Unknown'),
          city: String(shipperPlace['city'] ?? ''),
          postalCode: String(shipperPlace['postCode'] ?? ''),
          countryCode: String(shipperPlace['countryCode'] ?? ''),
        }
      : { name: 'Unknown' },
    receiver: consigneePlace
      ? {
          name: String(consigneePlace['city'] ?? 'Unknown'),
          city: String(consigneePlace['city'] ?? ''),
          postalCode: String(consigneePlace['postCode'] ?? ''),
          countryCode: String(consigneePlace['countryCode'] ?? ''),
        }
      : { name: 'Unknown' },
    packages,
    trackingHistory: eventsRaw.map((e) => {
      const ev = e as Record<string, unknown>
      const loc = ev['location'] as Record<string, unknown> | undefined
      return {
        timestamp: String(ev['date'] ?? ev['createdAt'] ?? ''),
        description: String(ev['comment'] ?? ev['code'] ?? ''),
        location: String(loc?.['name'] ?? ''),
        status: String(ev['code'] ?? ''),
      }
    }),
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

async function attemptTracking(referenceNumber: string): Promise<ShipmentData> {
  const context = await newContext()

  try {
    const page = await newPage(context)

    // Collect ALL API responses — page makes multiple calls (search + detail)
    const collectedBodies: unknown[] = []
    page.on('response', async (response) => {
      if (response.url().includes(API_PATTERN) && response.status() === 200) {
        try {
          const body = await response.json()
          collectedBodies.push(body)
          logger.info('API detail response captured', { referenceNumber, url: response.url() })
        } catch {
          // ignore parse errors on collected responses
        }
      }
    })

    // Also wait for the first non-429 response to detect errors early
    const initialResponsePromise = page.waitForResponse(
      (response) => response.url().includes(API_PATTERN) && response.status() !== 429,
      { timeout: RESPONSE_TIMEOUT_MS }
    )

    await page.goto(`${TRACKING_PAGE_URL}?refNumber=${encodeURIComponent(referenceNumber)}`)

    const initialResponse = await initialResponsePromise
    const status = initialResponse.status()

    logger.info('Initial API response received', { referenceNumber, status })

    // Classify status before any body/content-type checks
    const decision = classifyStatus(status)

    if (decision === 'fail_fast') {
      if (status === 404) throw new ShipmentNotFoundError(referenceNumber)
      throw new InvalidResponseError(`Unexpected status: ${status}`)
    }

    if (decision === 'retry') {
      if (status === 429) throw new RateLimitedError()
      throw new TimeoutError(referenceNumber)
    }

    // Only validate content-type on 200 OK
    const contentType = initialResponse.headers()['content-type'] ?? ''
    if (!contentType.includes('application/json')) {
      throw new InvalidResponseError(`Unexpected content-type: ${contentType}`)
    }

    // Wait for any follow-up detail API calls the page may trigger
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      logger.warn('Network did not reach idle state, proceeding with collected responses', { referenceNumber })
    })

    // Prefer the detail response (has sttNumber + goods + events) over trip/search responses
    const detailBody = collectedBodies.find((b) => {
      const body = b as Record<string, unknown>
      return 'sttNumber' in body || 'goods' in body
    })
    const bestBody = detailBody ?? collectedBodies.at(-1) ?? await initialResponse.json()

    if (!bestBody) {
      throw new InvalidResponseError('Empty response body on 200')
    }

    logger.info('Shipment data received', { referenceNumber, responseCount: collectedBodies.length })

    return normalizeShipment(bestBody, referenceNumber)
  } catch (error) {
    if (error instanceof TrackingError) throw error
    if (isNetworkError(error)) throw new NetworkError(String((error as Error).message))
    if (error instanceof Error && error.message.includes('Timeout')) {
      throw new TimeoutError(referenceNumber)
    }
    throw error
  } finally {
    await context.close()
  }
}

export async function fetchShipment(referenceNumber: string): Promise<ShipmentData> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= RETRY_POLICY.maxRetries + 1; attempt++) {
    try {
      logger.info('Tracking attempt', { referenceNumber, attempt })
      return await attemptTracking(referenceNumber)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      const isRetryable =
        (error instanceof TrackingError && error.retryable) || isNetworkError(error)

      if (!isRetryable || attempt > RETRY_POLICY.maxRetries) {
        logger.error('Tracking failed', { referenceNumber, attempt, error: lastError.message })
        throw lastError
      }

      logger.warn('Retrying with fresh session', {
        referenceNumber,
        attempt,
        reason: lastError.message,
      })
    }
  }

  throw lastError ?? new Error('Unknown tracking error')
}
