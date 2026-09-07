/**
 * 서버 전환 판정 훅 (#2442 — 에픽 app#2237 의 R).
 *
 * 화면은 이 훅으로 "서버가 이 면을 켜 주었는가" 를 묻는다. 코호트 계산은 서버에만 있다.
 *
 * ## 게이트 계층이 꺼져 있으면 묻지 않는다
 *
 * `canonicalRolloutEnabled` 가 꺼져 있으면 `gateEnabled === false` 이고, 그때 화면은
 * **서버 판정을 조건에서 뺀다** — 빌드 플래그만으로 오늘과 똑같이 그린다. callable 배포
 * 전에 fail-closed 를 적용하면 정상 화면이 꺼지기 때문이다.
 *
 * ## 기다리는 동안은 "모름" 이다
 *
 * `loading` 중에는 켜짐도 꺼짐도 아니다. 소비처는 이 상태에서 값을 그리지 않고(로딩) 기다린다 —
 * 꺼짐으로 단정하면 정상 사용자에게 "일시 중단" 이 깜빡인다.
 */
import { useEffect, useState } from "react";

import { useAuth } from "../contexts/AuthContext";
import {
  canonicalRolloutAllOff,
  canonicalRolloutGateEnabled,
  loadCanonicalRolloutOnce,
  type CanonicalRolloutSurface,
  type CanonicalRolloutSurfaces,
} from "../services/canonicalRollout";
import { canonicalConsumerEnabled, type CanonicalSurface } from "../config/canonicalConsumers";

export interface CanonicalRolloutState {
  /** 게이트 계층 스위치. false 면 `surfaces` 를 조건으로 쓰지 않는다. */
  gateEnabled: boolean;
  /** 서버 판정을 기다리는 중. 켜짐도 꺼짐도 아니다. */
  loading: boolean;
  surfaces: CanonicalRolloutSurfaces;
}

const OFF: CanonicalRolloutState = {
  gateEnabled: false,
  loading: false,
  surfaces: canonicalRolloutAllOff(),
};

export function useCanonicalRollout(): CanonicalRolloutState {
  const { user } = useAuth();
  // 런타임 설정은 fetch 로 늦게 도착할 수 있다 — 렌더마다 읽어 도착 시 그대로 반영된다.
  const gateEnabled = canonicalRolloutGateEnabled();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<CanonicalRolloutState>(OFF);

  useEffect(() => {
    if (!gateEnabled) {
      setState(OFF);
      return;
    }
    if (!uid) {
      // 미로그인은 판정 대상이 아니다 — fail-closed 기본값이다.
      setState({ gateEnabled: true, loading: false, surfaces: canonicalRolloutAllOff() });
      return;
    }
    let active = true;
    setState({ gateEnabled: true, loading: true, surfaces: canonicalRolloutAllOff() });
    void loadCanonicalRolloutOnce(uid).then((surfaces) => {
      if (active) setState({ gateEnabled: true, loading: false, surfaces });
    });
    return () => {
      active = false;
    };
  }, [gateEnabled, uid]);

  return state;
}

/**
 * 서버가 이 면을 켜 주었는가. 게이트 계층이 꺼져 있으면 조건에서 빠진다(통과).
 * 기다리는 중이면 꺼짐으로 답한다 — 판정 전에 켜진 것처럼 그리지 않는다.
 */
export function canonicalRolloutAllows(
  state: CanonicalRolloutState,
  surface: CanonicalRolloutSurface,
): boolean {
  if (!state.gateEnabled) return true;
  return state.surfaces[surface];
}

/**
 * stage 4 네 면(날씨·코스·정비·마일스톤)의 최종 판정.
 *
 * **빌드 플래그 AND 서버 면 플래그** 다. 빌드 플래그가 꺼져 있으면 서버가 무엇을 내려도
 * 꺼짐이다 — 로컬 스위치가 언제나 이긴다(배포 되돌리기 없이 끌 수 있는 마지막 수단).
 */
export function useCanonicalSurfaceEnabled(surface: CanonicalSurface): boolean {
  const rollout = useCanonicalRollout();
  if (!canonicalConsumerEnabled(surface)) return false;
  return canonicalRolloutAllows(rollout, surface);
}
