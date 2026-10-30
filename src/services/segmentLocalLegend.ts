import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { SegmentLocalLegend } from "@shared/types/segment-local-legend";
export async function loadSegmentLocalLegend(services: FirebaseServices, uid: string, segmentId: string): Promise<SegmentLocalLegend> {
  const {auth,functions}=services,user=auth.currentUser;
  const current = () => !!user && user.uid === uid && !user.isAnonymous && services.auth === auth && auth.currentUser === user && services.functions === functions;
  if (!uid || !current()) throw new Error("account_changed");
  await services.ensureAppCheckReady();
  if (!current()) throw new Error("account_changed");
  const { data: r } = await httpsCallable<{segmentId: string}, SegmentLocalLegend>(services.functions, "getSegmentLocalLegend")({ segmentId });
  if (!current()) throw new Error("account_changed");
  if (!r || r.windowWeeks !== 13 || r.minimumEfforts !== 3 || r.population !== "authorized_native_outdoor_bike" || r.globalRankAvailable !== false || !["complete", "partial"].includes(r.coverage) || r.scanLimit !== 500 ||
    ![r.scannedCount, r.totalEfforts, r.riderCount].every(n => Number.isSafeInteger(n) && n >= 0) || r.scannedCount > r.scanLimit || r.totalEfforts > r.scannedCount || r.riderCount > r.totalEfforts || !Number.isFinite(r.windowStartMs) || !Number.isFinite(r.windowEndMs) || r.windowStartMs > r.windowEndMs ||
    !(r.leader === null || r.coverage === "complete" && typeof r.leader.nickname === "string" && typeof r.leader.userId === "string" && Number.isInteger(r.leader.effortCount) && r.leader.effortCount >= 3 && r.leader.effortCount <= r.totalEfforts)) throw new Error("invalid_local_legend");
  return r;
}
