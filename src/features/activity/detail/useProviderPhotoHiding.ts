import { useEffect, useRef, useState } from "react";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import type { FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { logClientError } from "../../../services/errorLogger";
import { setProviderPhotosHidden } from "../../../services/nativeActivityPhoto";
import { hiddenProviderPhotoIds } from "./providerPhotoVisibility";

/**
 * Strava 사진 숨기기·다시 보이기 상태.
 *
 * 숨김 목록은 세 곳에서 온다: 화면이 받은 활동 문서(documentHiddenIds), 저장 응답, 탭이 다시 보일 때
 * 새로 읽은 활동 문서(refreshEnabled 일 때 — 활동 상세는 문서를 한 번만 읽어 다른 탭의 변경을 모른다).
 * 셋 다 "그 시점의 서버 목록"이므로 따로 비교하지 않고, 갱신마다 시작 순번을 매겨 **가장 나중에 시작한
 * 갱신의 결과**만 쓴다. 문서 목록이 바뀌면 그 순간 시작·완료된 갱신으로 본다. 그래서
 * - 요청 중에 문서가 바뀌면(원래 값으로 돌아와도) 늦은 저장 응답은 쓰지 않는다.
 * - 겹친 조회는 마지막으로 시작한 조회만 쓰고, 탭 복귀 조회 결과가 이 탭의 저장 응답보다 나중이면 그것을 따른다.
 * 활동·계정·서비스·Firestore 가 바뀌면 모든 값을 버리고, 그 전에 시작한 요청의 응답은 적용하지 않는다.
 */
export function useProviderPhotoHiding(input: {
  activityId: string | undefined; uid: string | undefined; services: FirebaseServices; documentHiddenIds: string[];
  firestore?: Firestore; refreshEnabled?: boolean;
  onDone: (hidden: boolean) => void; onError: (error: unknown, context: { activityId: string; hidden: boolean; count: number }) => void;
}) {
  const { activityId, uid, services, documentHiddenIds, firestore, refreshEnabled = false } = input;
  const scopeKey = `${activityId ?? ""}|${uid ?? ""}`;
  const scope = useRef({ scopeKey, services, firestore, generation: 0 });
  if (scope.current.scopeKey !== scopeKey || scope.current.services !== services || scope.current.firestore !== firestore) {
    scope.current = { scopeKey, services, firestore, generation: scope.current.generation + 1 };
  }
  const generation = scope.current.generation;
  // 갱신 시작 순번. 문서 목록 변경도 한 번의 갱신으로 센다.
  const sequence = useRef(0);
  const documentKey = JSON.stringify(documentHiddenIds);
  const documentStamp = useRef({ generation, key: documentKey, sequence: 0 });
  if (documentStamp.current.generation !== generation || documentStamp.current.key !== documentKey) {
    documentStamp.current = { generation, key: documentKey, sequence: ++sequence.current };
  }
  const [latest, setLatest] = useState<{ generation: number; sequence: number; ids: string[] } | null>(null);
  const [busy, setBusy] = useState<{ generation: number } | null>(null);
  const callbacks = useRef(input); callbacks.current = input;
  // 저장 중에 시작한 조회는 저장 전 목록을 읽을 수 있고, 순번이 더 커서 저장 결과를 버리게 만든다.
  // 그래서 저장 중 탭 복귀는 기록만 해 두고 저장이 끝난 뒤 한 번 조회한다.
  const saving = useRef<number | null>(null);
  const refreshAfterSave = useRef(false);
  const refreshNow = useRef<(() => void) | null>(null);

  /** 시작 순번이 지금까지 쓴 어떤 값보다 나중일 때만 결과를 쓴다. */
  const apply = (requestGeneration: number, requestSequence: number, ids: string[]) => {
    if (scope.current.generation !== requestGeneration || documentStamp.current.sequence > requestSequence) return;
    setLatest(previous => previous && previous.generation === requestGeneration && previous.sequence > requestSequence
      ? previous : { generation: requestGeneration, sequence: requestSequence, ids });
  };

  useEffect(() => {
    if (!refreshEnabled || !firestore || !activityId || typeof document === "undefined") return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (saving.current === generation) { refreshAfterSave.current = true; return; }
      const requestGeneration = generation, requestSequence = ++sequence.current;
      getDoc(doc(firestore, "activities", activityId)).then(snapshot => {
        const data = snapshot.data();
        if (data) apply(requestGeneration, requestSequence, hiddenProviderPhotoIds(data as { userId?: string; hiddenProviderPhotosV1?: unknown }));
      }).catch(error => logClientError("useProviderPhotoHiding.refresh", error, { activityId }));
    };
    refreshNow.current = refresh;
    document.addEventListener("visibilitychange", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      if (refreshNow.current === refresh) refreshNow.current = null;
    };
  }, [refreshEnabled, firestore, activityId, generation]);

  const isBusy = busy?.generation === generation;
  const change = async (photoIds: string[], hidden: boolean) => {
    if (!activityId || !photoIds.length || isBusy) return;
    const target = activityId, requestGeneration = generation, requestSequence = ++sequence.current;
    setBusy({ generation: requestGeneration });
    saving.current = requestGeneration; refreshAfterSave.current = false;
    try {
      const ids = await setProviderPhotosHidden(services, target, photoIds, hidden);
      if (scope.current.generation !== requestGeneration) return;
      apply(requestGeneration, requestSequence, ids);
      callbacks.current.onDone(hidden);
    } catch (error) {
      callbacks.current.onError(error, { activityId: target, hidden, count: photoIds.length });
    } finally {
      setBusy(previous => previous?.generation === requestGeneration ? null : previous);
      if (saving.current === requestGeneration) {
        saving.current = null;
        if (refreshAfterSave.current) { refreshAfterSave.current = false; refreshNow.current?.(); }
      }
    }
  };
  const current = latest && latest.generation === generation && latest.sequence > documentStamp.current.sequence ? latest : null;
  const hiddenIds = current && JSON.stringify(current.ids) !== documentKey ? current.ids : documentHiddenIds;
  return { hiddenIds, overriding: hiddenIds !== documentHiddenIds, busy: isBusy, change };
}
