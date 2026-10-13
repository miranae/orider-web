export const POWER_EFFORT_BASES = ["canonical_measured_85", "legacy_measured_mmp", "stage_native_v1", "stage_native_v2"] as const;
export type PowerEffortBasis = typeof POWER_EFFORT_BASES[number];
export type PowerEffortOrigin = "measured" | "stored_native_watts_unverified";
export interface PowerEffortIdentity { durationSeconds: number; basisVersion: PowerEffortBasis; powerSource: PowerEffortOrigin }
export interface PowerEffortDecision extends PowerEffortIdentity { authorityHash: string }
/** ownerHash는 native project/default Auth realm/UID/raw createdAt의 opaque digest. raw Auth binding은 서버 내부에만 둔다. */
/** 서버 private 저장·authority 전용. 공개 controls/response로 보내지 않는다. */
export interface PowerEffortPrivateActivityIdentity {
  createTime: string; lifecycleToken: string | null;
  basis: "document_create_time_and_validated_native_lifecycle" | "legacy_document_create_time_only";
}
export interface StagePowerEffortPreference {
  schemaVersion: 1; ownerHash: string; activityId: string; activityIncarnation: string;
  revision: string; excluded: PowerEffortDecision[]; activityIdentity: PowerEffortPrivateActivityIdentity;
}
export interface StagePowerEffortPreferenceRequest extends PowerEffortIdentity {
  activityId: string; expectedActivityIncarnation: string; activityRevision: string;
  baseMetricsRevision: string; currentPreferenceRevision: string | null;
  currentAuthorityHash: string | null; excluded: boolean; idempotencyKey: string;
}
export interface PowerEffortServerAuthority extends PowerEffortIdentity {
  ownerHash: string; activityId: string; activityIncarnation: string; activityRevision: string;
  baseMetricsRevision: string; originalPointHash: string; publicationBinding: string | null; activityIdentity: PowerEffortPrivateActivityIdentity;
}
