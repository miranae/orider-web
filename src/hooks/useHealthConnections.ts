import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import type { ConnectionDoc, ProviderId } from "@shared/types";

/**
 * `users/{uid}/connections/*` 컬렉션 실시간 구독.
 *
 * 각 provider 의 연결 상태 (status, lastSyncAt, scopes, meta) 를 반환.
 * 클라이언트 쓰기 권한 없음 (Firestore rules) — 본 hook 은 read-only.
 */
export function useHealthConnections(uid: string | null) {
  const [connections, setConnections] = useState<Record<ProviderId, ConnectionDoc | null>>({
    strava: null,
    apple_health: null,
    health_connect: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setConnections({ strava: null, apple_health: null, health_connect: null });
      setLoading(false);
      return;
    }
    const ref = collection(firestore, `users/${uid}/connections`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const next: Record<ProviderId, ConnectionDoc | null> = {
          strava: null,
          apple_health: null,
          health_connect: null,
        };
        for (const d of snap.docs) {
          const data = d.data() as Partial<ConnectionDoc>;
          const pid = d.id as ProviderId;
          if (pid in next) {
            next[pid] = { ...(data as ConnectionDoc), providerId: pid, uid };
          }
        }
        setConnections(next);
        setLoading(false);
      },
      (err) => {
        logClientError("useHealthConnections.subscribe", err, { uid });
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  return { connections, loading };
}
