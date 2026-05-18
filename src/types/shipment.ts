export interface Address {
  name: string
  street?: string
  city?: string
  postalCode?: string
  countryCode?: string
}

export interface Dimensions {
  length?: number
  width?: number
  height?: number
  unit?: string
}

export interface Package {
  packageId?: string
  weight?: number
  weightUnit?: string
  dimensions?: Dimensions
  pieceCount?: number
  trackingEvents?: TrackingEvent[]
}

export interface TrackingEvent {
  timestamp: string
  description: string
  location?: string
  status?: string
}

export interface ShipmentData {
  referenceNumber: string
  sender: Address
  receiver: Address
  packages: Package[]
  trackingHistory: TrackingEvent[]
  warnings?: string[]
}

export type RetryDecision = 'retry' | 'fail_fast'

export interface TrackingResult {
  success: boolean
  data?: ShipmentData
  error?: string
}
