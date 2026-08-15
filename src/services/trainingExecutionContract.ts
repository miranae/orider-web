import { z } from "zod";

const id = z.string().min(3).max(256);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const targetRevision = z.object({
  goalId: id, goalHash: z.string().regex(/^doc_[0-9a-f]{32}$/u), planRevision: z.string().regex(/^plan_[0-9a-f]{24}$/u),
  weeks: z.array(z.object({ weekId: id, hash: z.string().regex(/^doc_[0-9a-f]{32}$/u) }).strict()).max(104),
}).strict();
export const sessionExecutionLinkSchema = z.object({
  schemaVersion: z.literal(1), executionId: z.string().regex(/^exec_[0-9a-f]{24}$/u), status: z.enum(["reserved", "started", "linked", "invalidated"]),
  scheduledSessionId: id, dayRef: z.object({ goalId: id, weekId: id, dayIndex: z.number().int().min(0).max(6), localDate }).strict(),
  scheduledSessionRevision: id, planRevision: id, projectionId: id, prescriptionId: id.nullable(),
  prescriptionValidFrom: z.string().datetime({ offset: true }).nullable(), proposalId: id.nullable(),
  proposalAfterRevision: targetRevision.nullable(), receiptAuditId: z.string().regex(/^audit_[0-9a-f]{24}$/u).nullable(),
  activityId: id.nullable(), activityRevision: id.nullable(), discipline: z.enum(["bike", "run", "swim"]),
  startedAt: z.number().int().nonnegative().nullable(), linkedAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
  matchMethod: z.enum(["explicit-start", "manual", "legacy-time-window"]), matchConfidence: z.enum(["exact", "manual", "probable"]),
  outcomeStatus: z.enum(["pending", "completed", "partial", "skipped", "postponed"]), outcomeAt: z.number().int().nonnegative().nullable(),
  postponedToLocalDate: localDate.nullable(),
}).strict();
export type SessionExecutionLink = z.infer<typeof sessionExecutionLinkSchema>;
export function parseSessionExecutionLink(value: unknown): SessionExecutionLink { return sessionExecutionLinkSchema.parse(value); }
export function parseSessionExecutionList(value: unknown): SessionExecutionLink[] {
  return z.object({ executions: z.array(sessionExecutionLinkSchema).max(50) }).strict().parse(value).executions;
}
