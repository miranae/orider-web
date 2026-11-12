import { collection, query, where, orderBy, limit, startAfter, getDocs, type QueryDocumentSnapshot } from "firebase/firestore";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { Activity } from "@shared/types";
import { compareAthleteDocumentIds } from "./athleteProfile";
import { withReadDeadline } from "../utils/withReadDeadline";

export function createGearInspection(uid: string, services: FirebaseServices) {
  return { uid, auth: services.auth, database: services.firestore, functions: services.functions, owner: services.auth.currentUser, cursor: null as QueryDocumentSnapshot | null,
    gears: new Map<string, NonNullable<Activity["gear"]>>(), complete: false, loaded: 0,
    busy: false, paused: false, valid: true };
}
/** 원본 name별 최대 누적 거리와 동률 ID 순서를 보존한다. 완료 전에는 누적 장비 결과로 표시하지 않는다. */
export async function inspectGearPage(session: ReturnType<typeof createGearInspection>, services: FirebaseServices, current: () => boolean) {
  const valid = () => session.valid && current() && session.auth === services.auth && session.database === services.firestore && session.functions === services.functions && services.auth.currentUser === session.owner && session.owner?.uid === session.uid;
  if (!valid()) throw new Error("gear-inspection-session-changed");
  if (session.complete) return;
  const page = await withReadDeadline(getDocs(query(collection(services.firestore, "activities"), where("userId", "==", session.uid), where("deletedAt", "==", null), orderBy("__name__"), ...(session.cursor ? [startAfter(session.cursor)] : []), limit(50))), "gear-inspection-timeout");
  if (!valid()) throw new Error("gear-inspection-session-changed");
  let previousId = session.cursor?.id;
  for (const row of page.docs) {
    const data = row.data();
    if (data.userId !== session.uid || data.deletedAt != null || previousId && compareAthleteDocumentIds(row.id, previousId) <= 0) throw new Error("gear-inspection-inventory-changed");
    previousId = row.id;
  }
  for (const row of page.docs) {
    const gear = row.data().gear as Activity["gear"];
    if (!gear?.name || !gear.maxDistanceKm) continue;
    const previous = session.gears.get(gear.name);
    if (!previous || gear.totalDistanceKm > previous.totalDistanceKm) session.gears.set(gear.name, gear);
  }
  session.loaded += page.docs.length;
  session.cursor = page.docs[page.docs.length - 1] ?? session.cursor;
  session.complete = page.docs.length < 50;
}

/** 명시적 전체 검사는 작업당 최대 200페이지/10,000개 원본만 읽고 다음 커서를 보존한다. */
export async function inspectGear(session: ReturnType<typeof createGearInspection>, services: FirebaseServices, current: () => boolean, all = false) {
  if (!session.valid || !current() || session.auth !== services.auth || session.database !== services.firestore || session.functions !== services.functions || session.owner !== services.auth.currentUser || session.owner?.uid !== session.uid) throw new Error("gear-inspection-session-changed");
  if (session.busy || session.complete) return { limited: false };
  session.busy = true;
  session.paused = false;
  try {
    for (let request = 0; request < (all ? 200 : 1); request++) {
      await inspectGearPage(session, services, current);
      if (session.complete || session.paused) return { limited: false };
    }
    return { limited: all };
  } finally { session.busy = false; }
}
