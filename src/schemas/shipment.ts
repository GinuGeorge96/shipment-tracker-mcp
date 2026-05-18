import { z } from 'zod'

export const AddressSchema = z.object({
  name: z.string(),
  street: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().optional(),
})

export const DimensionsSchema = z.object({
  length: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  unit: z.string().optional(),
})

export const TrackingEventSchema = z.object({
  timestamp: z.string(),
  description: z.string(),
  location: z.string().optional(),
  status: z.string().optional(),
})

export const PackageSchema = z.object({
  packageId: z.string().optional(),
  weight: z.number().optional(),
  weightUnit: z.string().optional(),
  dimensions: DimensionsSchema.optional(),
  pieceCount: z.number().optional(),
  trackingEvents: z.array(TrackingEventSchema).optional(),
})

export const ShipmentSchema = z.object({
  referenceNumber: z.string(),
  sender: AddressSchema,
  receiver: AddressSchema,
  packages: z.array(PackageSchema),
  trackingHistory: z.array(TrackingEventSchema),
  warnings: z.array(z.string()).optional(),
})

export type Shipment = z.infer<typeof ShipmentSchema>
export type TrackingEvent = z.infer<typeof TrackingEventSchema>
export type Package = z.infer<typeof PackageSchema>
export type Address = z.infer<typeof AddressSchema>
