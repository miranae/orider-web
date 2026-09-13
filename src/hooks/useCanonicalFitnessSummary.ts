/**
 * 피트니스 요약 canonical consumer 훅 (#884/#891 의 E — 에픽 app#2237).
 *
 * `useCanonicalHomeSummary` 와 같은 규칙이다: **빌드 플래그 AND 호출 화면의 서버 전환
 * 판정**, 판정 전에는 아무것도 부르지 않고, `values` 가 null 이면 화면은 숫자를 그리지
 * 않는다.
 *
 * 홈 요약과 별도 면이다. 운영자는 Fitness 화면만 독립적으로 canary/중단할 수 있다.
 *
 * 응답 페이로드의 모양은 [parseCanonicalFitnessSummary] 가 판단한다. 기대한 모양이
 * 아니면 값 없음이다 — 0 으로 채우지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { canonicalDisplayShowsValue, decideCanonicalRender, type CanonicalDisplay } from "@shared/types/canonicalDisplay";
import type { CanonicalPeriod, CanonicalStatus } from "@shared/types/canonical";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { logClientError } from "../services/errorLogger";
import {
  canonicalConsumersEnabled,
  fetchCanonicalFitnessSummary,
  parseCanonicalFitnessSummary,
  type CanonicalFitnessSummaryData,
} from "../services/canonicalApi";
import { canonicalRolloutAllows, useCanonicalRollout } from "./useCanonicalRollout";

export interface CanonicalFitnessSummaryState {
  rolloutState: "pending" | "off" | "on";
  /** false 면 화면은 오늘과 똑같이 클라 계산을 그린다. */
  enabled: boolean;
  /** null 이면 **숫자를 그리지 않는다.** */
  values: CanonicalFitnessSummaryData | null;
  display: CanonicalDisplay | null;
  computedAt: number | null;
  status: CanonicalStatus | null;
  metadata: {
    algorithmVersion: string;
    inputRevision: string | null;
    inputDigest: string | null;
    period: CanonicalPeriod | null;
    asOf: number | null;
    timezone: string | null;
    generation: string | number | null;
  } | null;
  showingLastGood: boolean;
  retry: () => void;
}

const noop = () => undefined;
interface CanonicalFitnessSummarySnapshot extends CanonicalFitnessSummaryState {
  /** state와 last-good 값을 소유한 계정. 렌더 시 현재 uid와 즉시 대조한다. */
  ownerUid: string | null;
}

const DISABLED: CanonicalFitnessSummarySnapshot = {
  rolloutState: "off", enabled: false, values: null, display: null, computedAt: null, status: null,
  metadata: null, showingLastGood: false, retry: noop, ownerUid: null,
};

const PENDING: CanonicalFitnessSummarySnapshot = {
  ...DISABLED,
  rolloutState: "pending",
};

export function useCanonicalFitnessSummary(
  surface: "homeSummary" | "fitnessSummary" = "homeSummary",
): CanonicalFitnessSummaryState {
  const { user } = useAuth();
  const firebaseServices = useFirebaseServices();
  const rollout = useCanonicalRollout();
  const consumerEnabled = canonicalConsumersEnabled();
  const pending = consumerEnabled && rollout.gateEnabled && rollout.loading;
  const enabled = consumerEnabled && canonicalRolloutAllows(rollout, surface);
  const [state, setState] = useState<CanonicalFitnessSummarySnapshot>(DISABLED);
  const lastGood = useRef<CanonicalFitnessSummaryData | null>(null);
  const lastGoodMetadata = useRef<CanonicalFitnessSummaryState["metadata"]>(null);
  const lastUid = useRef<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // 늦게 도착한 응답이 최신을 덮지 않게 한다 (A→B→A 전환 포함).
  const generation = useRef(0);

  const load = useCallback(async (uid: string, myGeneration: number) => {
    const envelope = await fetchCanonicalFitnessSummary(uid, firebaseServices);
    if (generation.current !== myGeneration) return;
    const parsed = parseCanonicalFitnessSummary(envelope.data);
    if (envelope.data !== null && parsed === null) {
      // 값이 실려 왔는데 읽을 수 없다 — 조용히 빈 화면으로 넘기지 않고 남긴다.
      logClientError("useCanonicalFitnessSummary.shape", new Error("unexpected fitness summary payload"), { uid });
    }
    const shapeInvalid = envelope.data !== null && parsed === null;
    const renderEnvelope = shapeInvalid ? {
      ...envelope,
      data: null,
      status: "failed" as const,
      error: {
        code: "contract_mismatch",
        message: "피트니스 요약 응답 형식이 올바르지 않습니다",
        retryable: true,
      },
    } : envelope;
    const decision = decideCanonicalRender(renderEnvelope, lastGood.current !== null);
    if (decision.contractViolations.length > 0) {
      logClientError("useCanonicalFitnessSummary.contract", new Error(decision.contractViolations.join("; ")), { uid });
    }
    const accepted = parsed !== null && canonicalDisplayShowsValue(decision.display) ? parsed : null;
    const metadata = {
      algorithmVersion: envelope.algorithmVersion,
      inputRevision: envelope.inputRevision,
      inputDigest: envelope.inputDigest,
      period: envelope.period,
      asOf: accepted?.asOf ?? envelope.period?.asOf ?? null,
      timezone: accepted?.timezone ?? envelope.period?.timezone ?? null,
      generation: accepted?.generation ?? null,
    };
    if (accepted !== null) {
      lastGood.current = accepted;
      lastGoodMetadata.current = metadata;
    }
    const showingLastGood = accepted === null && lastGood.current !== null;
    setState({
      rolloutState: "on",
      enabled: true,
      // processing/failed/unavailable 에서도 동일 계정의 마지막 성공값은 버리지 않는다.
      // display/status 가 별도로 남으므로 낡은 값을 최신처럼 오인시키지 않는다.
      values: accepted ?? lastGood.current,
      display: decision.display,
      computedAt: envelope.computedAt,
      status: renderEnvelope.status,
      metadata: showingLastGood ? lastGoodMetadata.current : metadata,
      showingLastGood,
      retry: () => setReloadKey((current) => current + 1),
      ownerUid: uid,
    });
  }, [firebaseServices]);

  useEffect(() => {
    generation.current += 1;
    const myGeneration = generation.current;
    // 계정이 바뀔 때만 이전 값을 버린다. 같은 계정 재시도는 last-known-good 을 유지한다.
    const uid = user?.uid ?? null;
    const uidChanged = lastUid.current !== uid;
    if (uidChanged) {
      lastGood.current = null;
      lastGoodMetadata.current = null;
      lastUid.current = uid;
    }
    if (pending) {
      setState(PENDING);
      return;
    }
    if (!enabled || !user) {
      setState(DISABLED);
      return;
    }
    setState((previous) => ({
      rolloutState: "on",
      enabled: true,
      values: !uidChanged && previous.enabled ? previous.values : null,
      display: null,
      computedAt: !uidChanged && previous.enabled ? previous.computedAt : null,
      status: null,
      metadata: !uidChanged && previous.enabled ? previous.metadata : null,
      showingLastGood: !uidChanged && previous.enabled && previous.values !== null,
      retry: () => setReloadKey((current) => current + 1),
      ownerUid: uid,
    }));
    void load(user.uid, myGeneration);
  }, [user, load, enabled, pending, reloadKey]);

  if (pending) return PENDING;
  // effect보다 렌더가 먼저다. A→B 전환 렌더에서 A state를 그대로 반환하면 effect가 지우기
  // 전 한 프레임 동안 A의 피트니스가 B 화면에 노출된다. state 소유자가 다르면 즉시 가린다.
  if (!enabled) return DISABLED;
  if ((user?.uid ?? null) !== state.ownerUid) {
    return {
      rolloutState: "on",
      enabled: true,
      values: null,
      display: null,
      computedAt: null,
      status: null,
      metadata: null,
      showingLastGood: false,
      retry: () => setReloadKey((current) => current + 1),
    };
  }
  return state;
}
