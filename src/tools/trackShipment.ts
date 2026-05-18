import { z } from 'zod'
import { fetchShipment } from '../services/dbschenker.js'
import { logger } from '../utils/logger.js'
import {
  ShipmentNotFoundError,
  RateLimitedError,
  TimeoutError,
  NetworkError,
  TrackingError,
} from '../utils/errors.js'

export const trackShipmentInputSchema = z.object({
  referenceNumber: z
    .string()
    .min(1, 'Reference number is required')
    .trim()
    .describe('DB Schenker shipment reference number (e.g. 1806203236)'),
})

export type TrackShipmentInput = z.infer<typeof trackShipmentInputSchema>

export async function trackShipment(input: TrackShipmentInput): Promise<string> {
  const { referenceNumber } = input

  logger.info('MCP tool invoked', { tool: 'track_shipment', referenceNumber })

  try {
    const shipment = await fetchShipment(referenceNumber)

    const result = {
      referenceNumber: shipment.referenceNumber,
      sender: shipment.sender,
      receiver: shipment.receiver,
      packages: shipment.packages,
      trackingHistory: shipment.trackingHistory,
      ...(shipment.warnings && { warnings: shipment.warnings }),
    }

    return JSON.stringify(result, null, 2)
  } catch (error) {
    logger.error('MCP tool error', {
      tool: 'track_shipment',
      referenceNumber,
      error: error instanceof Error ? error.message : String(error),
    })

    if (error instanceof ShipmentNotFoundError) {
      return JSON.stringify({
        error: 'SHIPMENT_NOT_FOUND',
        message: `No shipment found for reference: ${referenceNumber}`,
      })
    }

    if (error instanceof RateLimitedError) {
      return JSON.stringify({
        error: 'RATE_LIMITED',
        message: 'Tracking service is rate limiting requests. Please try again shortly.',
      })
    }

    if (error instanceof TimeoutError) {
      return JSON.stringify({
        error: 'TIMEOUT',
        message: 'Tracking request timed out. Please try again.',
      })
    }

    if (error instanceof NetworkError) {
      return JSON.stringify({
        error: 'NETWORK_ERROR',
        message: 'Could not reach tracking service. Please check your connection.',
      })
    }

    if (error instanceof TrackingError) {
      return JSON.stringify({
        error: error.code,
        message: error.message,
      })
    }

    return JSON.stringify({
      error: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred. Please try again.',
    })
  }
}
