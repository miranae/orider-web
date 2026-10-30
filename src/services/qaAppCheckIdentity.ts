// Same operator-approved identity set as the five server callables; never an email/prefix rule.
const approvedQaUids = new Set([
  "qa_beta_m4_20261024_a",
  "qa_beta_m4_20261024_b",
  "qa_beta_m4_20261024_c",
  "qa_beta_m4_20261024_d",
  "qa_beta_m4_20261024_e",
  "qa_beta_m4_20261024_f",
  "qa_beta_m4_20261024_g",
  "qa_beta_m4_20261024_h",
  "qa_beta_m4_20261024_i",
  "qa_beta_m4_20261024_j",
  "qa_beta_m4_20261024_k",
  "qa_beta_m4_20261024_l",
]);

export function isApprovedQaAppCheckUser(
  user: { uid: string; isAnonymous: boolean } | null | undefined,
  projectId: string | undefined,
): boolean {
  return projectId === "miranae-orider-g1" && user?.isAnonymous === false && approvedQaUids.has(user.uid);
}
