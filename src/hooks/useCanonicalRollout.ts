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
 * ## kill switch 는 열린 탭에도 닿아야 한다
 *
 * 판정은 서버 캐시 TTL([CANONICAL_ROLLOUT_CACHE_TTL_MS])마다 다시 묻고, 탭이 다시 보이거나
 * (`visibilitychange`) 창이 포커스를 받으면 그 자리에서 한 번 더 묻는다. 마운트 시 한 번만
 * 물으면 사고 대응으로 서버를 뒤집어도 이미 열려 있는 탭은 새로고침 전까지 그대로다.
 * 재조회 중에는 `loading` 으로 돌아가지 않는다 — 정상 화면이 1분마다 깜빡이면 안 된다.
 *
 * ## 기다리는 동안은 "모름" 이다 — 그리고 **첫 렌더부터** 그렇다
 *
 * `loading` 중에는 켜짐도 꺼짐도 아니다. 소비처는 이 상태에서 값을 그리지 않고(로딩) 기다린다 —
 * 꺼짐으로 단정하면 정상 사용자에게 "일시 중단" 이 깜빡인다.
 *
 ## 남의 판정을 쓰지 않는다 (계정 전환)
 *
 * 판정은 **계정별**이다. 상태에 판정의 uid 를 함께 들고, 지금 로그인한 uid 와 다르면 렌더
 * 경로에서 곧바로 "판정 전" 으로 답한다. 이전에는 상태에 uid 가 없어서 A→B 전환 첫 렌더가
 * A 의 허용을 그대로 돌려주었고 — uid 변경 처리가 effect 라서 — B 의 판정이 오기 전에 구독·
 * 요청이 이미 나갔다 (#2237 리뷰). 로그아웃(uid null)도 같다.
 *
 * 이전에는 초기 상태가 `gateEnabled: false` 였다. 게이트가 **켜져 있을 때** 첫 렌더가
 * "게이트 없음" 으로 보였고, `canonicalRolloutAllows` 가 통과를 돌려주어 소비처가 판정 전에
 * 코스 요청과 소유자 지표 구독을 시작했다 (#2237 리뷰). 게이트가 켜져 있으면 effect 가 돌기
 * 전에도 상태는 "판정 전"(loading) 이다 — 조용한 통과는 없다. 게이트가 꺼져 있을 때(오늘의
 * 기본값)는 예전과 완전히 같다.
 */
import { useEffect, useState } from "react";

import { useAuth } from "../contexts/AuthContext";
import {
  CANONICAL_ROLLOUT_CACHE_TTL_MS,
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
  /**
   * 서버 판정을 **실제로 받았는가.** false 면 `surfaces` 는 fail-closed 기본값이지 서버가
   * "끄라" 고 말한 것이 아니다. 둘을 구분해야 하는 소비처가 있다 (`useActivityMetrics` 의
   * 공개 뷰어 경로).
   */
  verdictOk: boolean;
  surfaces: CanonicalRolloutSurfaces;
}

/**
 * 훅 내부 상태. 공개 모양에 **판정의 주인(uid)** 을 더한다 — 소비처는 이 필드를 볼 필요가
 * 없고(렌더 경로에서 이미 걸러진다), 보게 두면 각자 계정 비교를 다시 구현한다.
 */
interface RolloutSnapshot extends CanonicalRolloutState {
  /** 이 판정이 어느 계정의 것인가. 미로그인·판정 전은 null. */
  verdictUid: string | null;
}

/** 게이트가 켜져 있는데 아직 판정이 없는 상태. 첫 렌더와 런타임 설정 늦은 도착이 여기로 온다. */
const PENDING: RolloutSnapshot = {
  gateEnabled: true,
  loading: true,
  verdictOk: false,
  surfaces: canonicalRolloutAllOff(),
  verdictUid: null,
};

const OFF: RolloutSnapshot = {
  gateEnabled: false,
  loading: false,
  verdictOk: false,
  surfaces: canonicalRolloutAllOff(),
  verdictUid: null,
};

export function useCanonicalRollout(): CanonicalRolloutState {
  const { user } = useAuth();
  // 런타임 설정은 fetch 로 늦게 도착할 수 있다 — 렌더마다 읽어 도착 시 그대로 반영된다.
  const gateEnabled = canonicalRolloutGateEnabled();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<RolloutSnapshot>(() =>
    canonicalRolloutGateEnabled() ? PENDING : OFF,
  );

  useEffect(() => {
    if (!gateEnabled) {
      setState(OFF);
      return;
    }
    if (!uid) {
      // 미로그인은 판정 대상이 아니다 — fail-closed 기본값이다.
      setState({
        gateEnabled: true, loading: false, verdictOk: false,
        surfaces: canonicalRolloutAllOff(), verdictUid: null,
      });
      return;
    }
    let active = true;
    let inFlight = false;
    const refresh = () => {
      // 겹친 호출은 하나로 접는다 — 포커스가 연달아 오는 창에서 callable 을 도배하지 않는다.
      if (inFlight) return;
      inFlight = true;
      void loadCanonicalRolloutOnce(uid).then((result) => {
        inFlight = false;
        // 재조회는 loading 을 다시 켜지 않는다 — 켜면 정상 화면이 주기마다 깜빡인다.
        if (active) {
          setState({
            gateEnabled: true,
            loading: false,
            verdictOk: result.ok,
            surfaces: result.surfaces,
            verdictUid: uid,
          });
        }
      });
    };
    setState({
      gateEnabled: true, loading: true, verdictOk: false,
      surfaces: canonicalRolloutAllOff(), verdictUid: null,
    });
    refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, CANONICAL_ROLLOUT_CACHE_TTL_MS);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [gateEnabled, uid]);

  // 런타임 설정이 늦게 도착해 게이트가 방금 켜졌다면 effect 는 아직 돌지 않았다. 그 렌더에서
  // 옛 `gateEnabled: false` 를 그대로 돌려주면 한 프레임 동안 조용히 통과한다.
  if (gateEnabled && !state.gateEnabled) return PENDING;
  if (!gateEnabled && state.gateEnabled) return OFF;
  // 계정이 방금 바뀌었다면(로그아웃 포함) 손에 있는 판정은 **남의 것**이다. effect 가 돌기
  // 전이므로 여기서 막지 않으면 그 한 프레임에 이전 계정의 허용으로 읽기가 나간다.
  if (gateEnabled && !state.loading && state.verdictUid !== uid) return PENDING;
  return state;
}

/**
 * 서버가 이 면을 켜 주었는가. 게이트 계층이 꺼져 있으면 조건에서 빠진다(통과).
 * 기다리는 중이면 꺼짐으로 답한다 — 판정 전에 켜진 것처럼 그리지 않는다. 첫 렌더도 마찬가지다.
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
