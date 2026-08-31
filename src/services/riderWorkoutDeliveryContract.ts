import { z } from "zod";

export const RIDER_WORKOUT_BUNDLE_VERSION = 1 as const;

export const riderWorkoutTypeSchema = z.enum(["recovery", "endurance"]);
export type RiderWorkoutType = z.infer<typeof riderWorkoutTypeSchema>;

export const riderWorkoutDeliveryStateSchema = z.enum([
  "pending",
  "received",
  "deferred_in_ride",
  "ready_for_next_ride",
  "execution_started",
  "completed",
  "failed",
  "superseded",
]);
export type RiderWorkoutDeliveryState = z.infer<typeof riderWorkoutDeliveryStateSchema>;
export type RiderWorkoutPresentationState = RiderWorkoutDeliveryState | "expired";

const DELIVERY_STATE_ORDER: Record<RiderWorkoutDeliveryState, number> = {
  pending: 0,
  received: 1,
  deferred_in_ride: 2,
  ready_for_next_ride: 3,
  execution_started: 4,
  completed: 5,
  failed: 5,
  superseded: 5,
};

export function canAdvanceRiderWorkoutDeliveryState(
  previous: RiderWorkoutDeliveryState,
  next: RiderWorkoutDeliveryState,
): boolean {
  if (previous === next) return true;
  if (["completed", "failed", "superseded"].includes(previous)) return false;
  return DELIVERY_STATE_ORDER[next] >= DELIVERY_STATE_ORDER[previous];
}

const timestampSchema = z.union([
  z.number().finite().nonnegative(),
  z.object({ toMillis: z.function() }).passthrough(),
]);
const firestoreTimestampSchema = z.object({
  seconds: z.number().int().nonnegative(),
  nanoseconds: z.number().int().min(0).max(999_999_999),
}).passthrough();

export const riderWorkoutDeviceRegistrationSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
  platform: z.enum(["android", "ios"]).optional(),
  appVersion: z.string().optional(),
  status: z.literal("active"),
  lastSeenAt: timestampSchema.optional(),
  supportedCapabilities: z.object({
    workoutBundleVersions: z.array(z.number().int()).refine((versions) => versions.includes(RIDER_WORKOUT_BUNDLE_VERSION)),
  }).passthrough(),
}).passthrough();

export type RiderWorkoutDeviceRegistration = z.infer<typeof riderWorkoutDeviceRegistrationSchema> & {
  lastSeenAtMillis: number;
};

const workoutStepSchema = z.object({
  label: z.enum(["WU", "Z1", "Z2", "CD"]),
  durationSec: z.number().int().positive(),
  targetPowerMinW: z.number().int().nonnegative(),
  targetPowerMaxW: z.number().int().positive(),
}).strict().refine((step) => step.targetPowerMaxW >= step.targetPowerMinW);

export const riderWorkoutBundleSchema = z.object({
  schemaVersion: z.literal(1),
  deliveryId: z.string().min(1),
  targetDeviceId: z.string().min(1),
  generation: z.number().int().positive(),
  workoutType: riderWorkoutTypeSchema,
  targetTss: z.union([z.literal(20), z.literal(45)]),
  ftpW: z.number().int().positive(),
  ftpRevision: z.string().nullable(),
  zoneSchemeVersion: z.literal("coggan-7-v1"),
  templateRevision: z.literal("rider-workout-template-v1"),
  contentRevision: z.string().regex(/^[a-f0-9]{64}$/),
  steps: z.array(workoutStepSchema).min(1),
  issuedAt: z.number().finite().nonnegative(),
  expiresAt: z.number().finite().positive(),
}).strict().superRefine((bundle, context) => {
  if (bundle.expiresAt <= bundle.issuedAt) context.addIssue({ code: "custom", message: "bundle expiry must follow issue time" });
  const expectedMain = bundle.workoutType === "recovery" ? "Z1" : "Z2";
  if (bundle.steps.some((step) => step.label === (expectedMain === "Z1" ? "Z2" : "Z1"))
    || !bundle.steps.some((step) => step.label === expectedMain)) {
    context.addIssue({ code: "custom", message: "bundle workout zone mismatch" });
  }
});
export type RiderWorkoutBundle = z.infer<typeof riderWorkoutBundleSchema>;

export const createRiderWorkoutDeliveryResponseSchema = z.object({
  ok: z.literal(true),
  deliveryId: z.string().min(1),
  generation: z.number().int().positive(),
  state: riderWorkoutDeliveryStateSchema,
  idempotent: z.boolean(),
}).strict();
export type CreateRiderWorkoutDeliveryResponse = z.infer<typeof createRiderWorkoutDeliveryResponseSchema>;

export const riderWorkoutDeliverySchema = z.object({
  schemaVersion: z.literal(1),
  deliveryId: z.string().min(1),
  requestId: z.string().min(8).max(128),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetDeviceId: z.string().min(1),
  generation: z.number().int().positive(),
  state: riderWorkoutDeliveryStateSchema,
  bundle: riderWorkoutBundleSchema,
  failureCode: z.string().nullable(),
  createdAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
  acknowledgedAt: z.number().finite().nonnegative().nullable(),
  expireAt: firestoreTimestampSchema,
}).strict().superRefine((delivery, context) => {
  if (delivery.bundle.deliveryId !== delivery.deliveryId || delivery.bundle.generation !== delivery.generation
    || delivery.bundle.targetDeviceId !== delivery.targetDeviceId) {
    context.addIssue({ code: "custom", message: "delivery bundle identity mismatch" });
  }
  if (delivery.state === "failed") {
    if (!delivery.failureCode || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(delivery.failureCode)) {
      context.addIssue({ code: "custom", message: "failed delivery requires failureCode" });
    }
  } else if (delivery.failureCode !== null) {
    context.addIssue({ code: "custom", message: "failureCode is only valid for failed delivery" });
  }
});
export type RiderWorkoutDelivery = z.infer<typeof riderWorkoutDeliverySchema>;

export const riderWorkoutDeviceStateSchema = z.object({
  schemaVersion: z.literal(1),
  deviceId: z.string().min(1),
  latestDeliveryId: z.string().min(8).max(128),
  latestGeneration: z.number().int().positive(),
  bundle: riderWorkoutBundleSchema,
  lastCreatedAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
}).strict().superRefine((state, context) => {
  if (state.bundle.deliveryId !== state.latestDeliveryId
    || state.bundle.generation !== state.latestGeneration
    || state.bundle.targetDeviceId !== state.deviceId
    || state.bundle.deliveryId.length < 8) {
    context.addIssue({ code: "custom", message: "device state bundle identity mismatch" });
  }
});
export type RiderWorkoutDeviceState = z.infer<typeof riderWorkoutDeviceStateSchema>;

export interface CreateRiderWorkoutDeliveryRequest {
  expectedUid: string;
  requestId: string;
  targetDeviceId: string;
  workoutType: RiderWorkoutType;
}

export function timestampMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return 0;
}

export function parseRiderWorkoutDeviceRegistration(id: string, raw: unknown): RiderWorkoutDeviceRegistration | null {
  const parsed = riderWorkoutDeviceRegistrationSchema.safeParse({ ...(raw as object), deviceId: (raw as { deviceId?: unknown })?.deviceId ?? id });
  if (!parsed.success) return null;
  return { ...parsed.data, lastSeenAtMillis: timestampMillis(parsed.data.lastSeenAt) };
}

export function parseRiderWorkoutDelivery(raw: unknown): RiderWorkoutDelivery | null {
  const parsed = riderWorkoutDeliverySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseRiderWorkoutDeviceState(raw: unknown): RiderWorkoutDeviceState | null {
  const parsed = riderWorkoutDeviceStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function deliveryPresentationState(delivery: RiderWorkoutDelivery | null, now = Date.now()): RiderWorkoutPresentationState | null {
  if (!delivery) return null;
  if (!["execution_started", "completed", "failed", "superseded"].includes(delivery.state)
    && delivery.bundle.expiresAt <= now) return "expired";
  return delivery.state;
}

export function canCreateAfterDelivery(state: RiderWorkoutPresentationState | null): boolean {
  return state !== "execution_started";
}
