/**
 * 정비 스냅샷 정본 훅 (#887).
 *
 * 웹에 정비 화면이 아직 없어 지금은 소비자가 없다 — 화면이 생길 때 클라이언트가 odometer 로
 * 부품 상태를 다시 판정하지 않도록 읽기 경로를 미리 하나로 고정해 둔다.
 * 전환이 꺼져 있으면 아무것도 읽지 않는다.
 */
import { useEffect, useState } from "react";

import { canonicalDisplayFor, type CanonicalDisplay } from "@shared/types/canonicalDisplay";
import { canonicalConsumerEnabled } from "../config/canonicalConsumers";
import { fetchMaintenanceSnapshot, type MaintenanceEnvelope } from "../services/maintenanceSnapshotReader";

export interface MaintenanceSnapshotState {
  envelope: MaintenanceEnvelope | null;
  display: CanonicalDisplay | null;
}

export function useMaintenanceSnapshot(
  uid: string | null | undefined,
  bikeProfileId: string | null | undefined,
): MaintenanceSnapshotState {
  const [envelope, setEnvelope] = useState<MaintenanceEnvelope | null>(null);
  // 런타임 설정은 fetch 로 늦게 도착할 수 있다 — 플래그 값을 deps 에 넣어 도착 시 재구독한다.
  const enabled = canonicalConsumerEnabled("maintenance");

  useEffect(() => {
    if (!uid || !bikeProfileId || !enabled) {
      setEnvelope(null);
      return;
    }
    let active = true;
    void fetchMaintenanceSnapshot(uid, bikeProfileId).then((next) => {
      if (active) setEnvelope(next);
    });
    return () => { active = false; };
  }, [uid, bikeProfileId, enabled]);

  return {
    envelope,
    display: envelope ? canonicalDisplayFor(envelope.status, envelope.data !== null) : null,
  };
}
