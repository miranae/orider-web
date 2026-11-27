import { collection, getDocsFromServer, limit, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import type { FirebaseServices } from "../contexts/FirebaseServicesContext";

export interface FtpRegistration {
  id: string;
  platform: string;
  lastSeenAt: number;
}

function requireOwner(services: FirebaseServices, uid: string) {
  const user = services.auth.currentUser;
  if (!user || user.uid !== uid || user.isAnonymous || services.isSessionApproved?.(user) === false) {
    throw new Error("account_changed");
  }
}

export async function listActiveFtpDevices(services: FirebaseServices, uid: string): Promise<FtpRegistration[]> {
  requireOwner(services, uid);
  const snapshot = await getDocsFromServer(query(
    collection(services.firestore, "users", uid, "deviceRegistrations"), where("status", "==", "active"), limit(8),
  ));
  requireOwner(services, uid);
  return snapshot.docs.map((doc) => {
    const { platform, lastSeenAt } = doc.data();
    return { id: doc.id, platform: typeof platform === "string" ? platform : "", lastSeenAt: typeof lastSeenAt === "number" ? lastSeenAt : 0 };
  }).sort((a, b) => a.lastSeenAt - b.lastSeenAt);
}

export async function retireFtpRegistration(services: FirebaseServices, uid: string, deviceId: string) {
  await services.ensureAppCheckReady();
  requireOwner(services, uid);
  const retire = httpsCallable<{ expectedUid: string; deviceId: string }, { ok: boolean; deviceId: string; status: string }>(
    services.functions, "retireRiderFtpDevice",
  );
  const { data } = await retire({ expectedUid: uid, deviceId });
  requireOwner(services, uid);
  if (!data.ok || data.deviceId !== deviceId || data.status !== "retired") throw new Error("invalid_retirement");
}
