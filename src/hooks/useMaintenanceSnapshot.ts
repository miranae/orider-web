/**
 * 정비 스냅샷 정본 훅 (#887).
 *
 * 프로필 장비의 자전거 누적 거리가 소비한다 — 클라이언트가 odometer 로
 * 부품 상태를 다시 판정하지 않도록 읽기 경로를 미리 하나로 고정해 둔다.
 * 전환이 꺼져 있으면 아무것도 읽지 않는다.
 */
import { useCallback, useEffect, useState } from "react";

import { canonicalDisplayFor, type CanonicalDisplay } from "@shared/types/canonicalDisplay";
import { useCanonicalSurfaceEnabled } from "./useCanonicalRollout";
import { fetchMaintenanceSnapshot, type MaintenanceEnvelope } from "../services/maintenanceSnapshotReader";

export interface MaintenanceSnapshotState {
  envelope: MaintenanceEnvelope | null;
  display: CanonicalDisplay | null;
  /** 읽기 실패 뒤 다시 읽는다. 읽는 중(스냅샷 없음)에는 아무것도 하지 않는다. */
  reload: () => void;
}

export function useMaintenanceSnapshot(
  uid: string | null | undefined,
  bikeProfileId: string | null | undefined,
): MaintenanceSnapshotState {
  const [snapshot, setSnapshot] = useState<{ uid: string; bikeProfileId: string; envelope: MaintenanceEnvelope } | null>(null);
  // 빌드 플래그 AND 서버 전환 판정. 둘 다 늦게 도착할 수 있으므로 값을 deps 에 넣는다.
  const enabled = useCanonicalSurfaceEnabled("maintenance");
  // 다시 읽기 세대 — 바뀌면 다시 읽는다. 앞선 읽기의 늦은 응답은 active 로 버린다(실패 기록은 reader 가 남긴다).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!uid || !bikeProfileId || !enabled) {
      setSnapshot(null);
      return;
    }
    setSnapshot(null);
    let active = true;
    void fetchMaintenanceSnapshot(uid, bikeProfileId).then((next) => {
      if (active) setSnapshot({ uid, bikeProfileId, envelope: next });
    });
    return () => { active = false; };
  }, [uid, bikeProfileId, enabled, attempt]);

  // Hide the previous owner/profile synchronously, before the new effect runs.
  const envelope = enabled && uid && bikeProfileId && snapshot?.uid === uid && snapshot.bikeProfileId === bikeProfileId ? snapshot.envelope : null;
  const loaded = envelope !== null;
  const reload = useCallback(() => { if (loaded) setAttempt((n) => n + 1); }, [loaded]);
  return {
    envelope,
    display: envelope ? canonicalDisplayFor(envelope.status, envelope.data !== null) : null,
    reload,
  };
}
