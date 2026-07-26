import { z } from "zod";

const currentContextToken = z.string().min(100).max(4096)
  .regex(/^ride2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u);
const bridgedContextToken = z.string().min(100).max(4096)
  .regex(/^ride[12]\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u);
const inputRevision = z.string().regex(/^ridein_[a-f0-9]{24}$/u);
const execution = z.object({ providerCalls: z.literal(0), quotaConsumed: z.literal(false), writes: z.literal(0) }).strict();
const course = z.object({ distanceM: z.number().int().min(1), elevationGainM: z.number().int().min(0) }).strict();
const estimate = z.object({ totalTimeSec: z.number().int().min(1), averageSpeedKph: z.number().positive() }).strict();
const segment = z.object({ index: z.number().int().min(0), startDistanceM: z.number().int().min(0),
  endDistanceM: z.number().int().min(1), averageGradePct: z.number().finite(),
  estimatedSpeedKph: z.number().positive(), estimatedTimeSec: z.number().int().min(1) }).strict();
const assumptions = z.object({ model: z.literal("cp-wprime-whole-course-v1"), weather: z.literal("not_modeled"),
  stops: z.literal("not_modeled"), fueling: z.literal("not_generated"),
  optimalSegmentPower: z.literal("not_generated") }).strict();
const questionCodes = z.tuple([z.literal("HARDEST_SECTION"), z.literal("PERSONAL_PACING")]);

export const coachRidePlanTokenRequestSchema = z.object({ courseId: z.string().trim().min(1).max(256) }).strict();
export const coachRidePlanPinnedRequestSchema = z.object({ courseId: z.string().trim().min(1).max(256), contextToken: bridgedContextToken }).strict();
export const coachRidePlanAiRequestSchema = z.object({ courseId: z.string().trim().min(1).max(256), contextToken: bridgedContextToken,
  questionCode: z.enum(["HARDEST_SECTION", "PERSONAL_PACING"]) }).strict();

const tokenEnvelope = z.object({ data: z.object({ contextToken: currentContextToken, inputRevision,
  expiresAt: z.string().datetime({ offset: true }), secretVersion: z.string().regex(/^ride-plan-v[1-9][0-9]*$/u),
  execution }).strict() }).strict();
const ridePlan = z.object({ schemaVersion: z.literal("coach-ride-plan-v1"),
  status: z.enum(["ok", "missing_pdc", "missing_weight"]), contextToken: bridgedContextToken, inputRevision, course,
  estimate: estimate.nullable(), segments: z.array(segment).max(12), assumptions,
  exampleQuestionCodes: questionCodes, execution }).strict();
const snapshotEnvelope = z.object({ data: ridePlan }).strict();
const aiProjection = z.object({ schemaVersion: z.literal("coach-ride-plan-v1"), inputRevision,
  questionCode: z.enum(["HARDEST_SECTION", "PERSONAL_PACING"]), course, estimate: estimate.nullable(),
  segments: z.array(segment).max(12), assumptions }).strict();
const aiEnvelope = z.object({ data: aiProjection }).strict();

export type CoachRidePlanToken = z.infer<typeof tokenEnvelope>["data"];
export type CoachRidePlan = z.infer<typeof ridePlan>;
export type CoachRidePlanQuestionCode = "HARDEST_SECTION" | "PERSONAL_PACING";
export type CoachRidePlanAiProjection = z.infer<typeof aiProjection>;

export function parseCoachRidePlanToken(value: unknown): CoachRidePlanToken {
  return tokenEnvelope.parse(value).data;
}

export function parseCoachRidePlan(value: unknown): CoachRidePlan {
  return snapshotEnvelope.parse(value).data;
}

export function parseCoachRidePlanAiProjection(value: unknown): CoachRidePlanAiProjection {
  return aiEnvelope.parse(value).data;
}

/** Central respond resolves the encrypted binding and therefore accepts the current v2 token only. */
export function isCoachRidePlanRespondToken(value: string): value is `ride2.${string}.${string}` {
  return currentContextToken.safeParse(value).success;
}
