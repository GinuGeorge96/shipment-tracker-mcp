export type ErrorCode =
  | 'SHIPMENT_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN_ERROR'

export class TrackingError extends Error {
  public readonly code: ErrorCode
  public readonly retryable: boolean

  constructor(message: string, code: ErrorCode, retryable = false) {
    super(message)
    this.name = 'TrackingError'
    this.code = code
    this.retryable = retryable
  }
}

export class ShipmentNotFoundError extends TrackingError {
  constructor(referenceNumber: string) {
    super(`Shipment not found: ${referenceNumber}`, 'SHIPMENT_NOT_FOUND', false)
    this.name = 'ShipmentNotFoundError'
  }
}

export class RateLimitedError extends TrackingError {
  constructor() {
    super('Rate limited by tracking service', 'RATE_LIMITED', true)
    this.name = 'RateLimitedError'
  }
}

export class NetworkError extends TrackingError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR', true)
    this.name = 'NetworkError'
  }
}

export class TimeoutError extends TrackingError {
  constructor(referenceNumber: string) {
    super(`Tracking request timed out for: ${referenceNumber}`, 'TIMEOUT', true)
    this.name = 'TimeoutError'
  }
}

export class SchemaValidationError extends TrackingError {
  constructor(details: string) {
    super(`Schema validation failed: ${details}`, 'SCHEMA_VALIDATION_FAILED', false)
    this.name = 'SchemaValidationError'
  }
}

export class InvalidResponseError extends TrackingError {
  constructor(details: string) {
    super(`Invalid response from tracking service: ${details}`, 'INVALID_RESPONSE', false)
    this.name = 'InvalidResponseError'
  }
}
