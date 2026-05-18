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

  // DSV API may return a shipments array or a single shipment object
  const shipment = Array.isArray(data['shipments'])
    ? (data['shipments'][0] as Record<string, unknown>)
    : data

  const senderRaw = (shipment['consignor'] ?? shipment['sender'] ?? shipment['shipper']) as
    | Record<string, unknown>
    | undefined
  const receiverRaw = (shipment['consignee'] ?? shipment['receiver'] ?? shipment['recipient']) as
    | Record<string, unknown>
    | undefined
  const packagesRaw = Array.isArray(shipment['packages']) ? shipment['packages'] : []
  const eventsRaw = Array.isArray(shipment['events'])
    ? shipment['events']
    : Array.isArray(shipment['trackingHistory'])
      ? shipment['trackingHistory']
      : []

  if (!senderRaw) warnings.push('Sender information unavailable')
  if (!receiverRaw) warnings.push('Receiver information unavailable')
  if (packagesRaw.length === 0) warnings.push('Package details unavailable')
  if (eventsRaw.length === 0) warnings.push('Tracking history unavailable')

  return {
    referenceNumber,
    sender: senderRaw ? normalizeAddress(senderRaw) : { name: 'Unknown' },
    receiver: receiverRaw ? normalizeAddress(receiverRaw) : { name: 'Unknown' },
    packages: packagesRaw.map((p) => normalizePackage(p as Record<string, unknown>)),
    trackingHistory: eventsRaw.map((e) => normalizeEvent(e as Record<string, unknown>)),
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

async function attemptTracking(referenceNumber: string): Promise<ShipmentData> {
  const context = await newContext()

  try {
    const page = await newPage(context)

    // Register response listener BEFORE navigation to avoid race conditions
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes(API_PATTERN),
      { timeout: RESPONSE_TIMEOUT_MS }
    )

    await page.goto(`${TRACKING_PAGE_URL}?refNumber=${encodeURIComponent(referenceNumber)}`)

    const response = await responsePromise
    const status = response.status()

    logger.info('API response received', { referenceNumber, status })

    // Validate content-type before parsing
    const contentType = response.headers()['content-type'] ?? ''
    if (!contentType.includes('application/json')) {
      throw new InvalidResponseError(`Unexpected content-type: ${contentType}`)
    }

    const decision = classifyStatus(status)

    if (decision === 'fail_fast') {
      if (status === 404) throw new ShipmentNotFoundError(referenceNumber)
      throw new InvalidResponseError(`Unexpected status: ${status}`)
    }

    if (decision === 'retry') {
      if (status === 429) throw new RateLimitedError()
      throw new TimeoutError(referenceNumber)
    }

    // 200 OK — parse body
    const body: unknown = await response.json()

    if (!body) {
      throw new InvalidResponseError('Empty response body on 200')
    }

    logger.info('Shipment data received', { referenceNumber })

    return normalizeShipment(body, referenceNumber)
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
