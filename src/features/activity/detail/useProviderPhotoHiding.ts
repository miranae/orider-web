import { useEffect, useRef, useState } from "react";
import { doc, getDocFromServer, type Firestore } from "firebase/firestore";
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
  /** 화면의 활동 문서 피드 본문 리비전. 바뀌면 문서가 새로 온 것으로 보고 문서를 따른다. */
  documentFeedRevision?: string | null;
  firestore?: Firestore; refreshEnabled?: boolean;
  onDone: (hidden: boolean) => void; onError: (error: unknown, context: { activityId: string; hidden: boolean; count: number }) => void;
}) {
  const { activityId, uid, services, documentHiddenIds, documentFeedRevision = null, firestore, refreshEnabled = false } = input;
  const scopeKey = `${activityId ?? ""}|${uid ?? ""}`;
  const scope = useRef({ scopeKey, services, firestore, generation: 0 });
  if (scope.current.scopeKey !== scopeKey || scope.current.services !== services || scope.current.firestore !== firestore) {
    scope.current = { scopeKey, services, firestore, generation: scope.current.generation + 1 };
  }
  const generation = scope.current.generation;
  // 갱신 시작 순번. 문서 목록 변경도 한 번의 갱신으로 센다.
  const sequence = useRef(0);
  const documentKey = JSON.stringify(documentHiddenIds);
  const documentStampKey = JSON.stringify([documentKey, documentFeedRevision]);
  const documentStamp = useRef({ generation, key: documentStampKey, sequence: 0 });
  if (documentStamp.current.generation !== generation || documentStamp.current.key !== documentStampKey) {
    documentStamp.current = { generation, key: documentStampKey, sequence: ++sequence.current };
  }
  // fromDocument: 활동 문서를 새로 읽은 값이면 그 문서의 피드 본문(feedContentV1)도 함께 둔다.
  type Latest = { generation: number; sequence: number; ids: string[]; fromDocument: boolean; feedContentV1?: unknown };
  const [latest, setLatest] = useState<Latest | null>(null);
  const [busy, setBusy] = useState<{ generation: number } | null>(null);
  const callbacks = useRef(input); callbacks.current = input;
  // 저장 중에 시작한 조회는 저장 전 목록을 읽을 수 있고, 순번이 더 커서 저장 결과를 버리게 만든다.
  // 그래서 저장 중 탭 복귀는 기록만 해 두고 저장이 끝난 뒤 한 번 조회한다.
  const saving = useRef<number | null>(null);
  const refreshAfterSave = useRef(false);
  const refreshNow = useRef<(() => void) | null>(null);

  /** 요청을 시작한 인증 사용자 객체. 같은 UID 라도 다시 로그인해 객체가 바뀌면 그 전 응답은 쓰지 않는다. */
  const currentUser = () => scope.current.services.auth.currentUser;
  /** 시작 순번이 지금까지 쓴 어떤 값보다 나중이고, 시작 때와 같은 인증 사용자일 때만 결과를 쓴다. */
  const apply = (next: Latest, requestUser: unknown) => {
    if (scope.current.generation !== next.generation || documentStamp.current.sequence > next.sequence || currentUser() !== requestUser) return;
    setLatest(previous => previous && previous.generation === next.generation && previous.sequence > next.sequence ? previous : next);
  };

  useEffect(() => {
    if (!refreshEnabled || !firestore || !activityId || typeof document === "undefined") return;
    const read = () => {
      const requestGeneration = generation, requestSequence = ++sequence.current, requestUser = currentUser();
      // 캐시의 옛 문서가 방금 받은 저장 응답을 덮지 않도록 서버에서 확인한 문서만 쓴다(오프라인이면 실패로 기록).
      getDocFromServer(doc(firestore, "activities", activityId)).then(snapshot => {
        const data = snapshot.data() as { userId?: string; hiddenProviderPhotosV1?: unknown; feedContentV1?: unknown } | undefined;
        if (data) apply({ generation: requestGeneration, sequence: requestSequence, ids: hiddenProviderPhotoIds(data), fromDocument: true, feedContentV1: data.feedContentV1 }, requestUser);
      }).catch(error => logClientError("useProviderPhotoHiding.refresh", error, { activityId }));
    };
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (saving.current === generation) { refreshAfterSave.current = true; return; }
      read();
    };
    refreshNow.current = read;
    document.addEventListener("visibilitychange", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      if (refreshNow.current === read) refreshNow.current = null;
    };
  }, [refreshEnabled, firestore, activityId, generation]);

  const isBusy = busy?.generation === generation;
  const change = async (photoIds: string[], hidden: boolean) => {
    if (!activityId || !photoIds.length || isBusy) return;
    const target = activityId, requestGeneration = generation, requestSequence = ++sequence.current, requestUser = currentUser();
    setBusy({ generation: requestGeneration });
    saving.current = requestGeneration; refreshAfterSave.current = false;
    try {
      const ids = await setProviderPhotosHidden(services, target, photoIds, hidden);
      if (scope.current.generation !== requestGeneration) return;
      apply({ generation: requestGeneration, sequence: requestSequence, ids, fromDocument: false }, requestUser);
      // 서버는 숨김과 함께 피드 본문을 다시 만든다. 화면의 활동 문서는 옛 본문이라 복원한 사진이
      // 거기 없으면 나타나지 않으므로, 저장 뒤 문서를 다시 읽어 새 본문을 받는다.
      refreshAfterSave.current = true;
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
  return {
    hiddenIds, busy: isBusy, change,
    /** 새로 읽은 활동 문서의 피드 본문. 화면의 활동 문서보다 새로우면 이것을 쓴다(없으면 undefined). */
    feedContentV1: current?.fromDocument ? current.feedContentV1 : undefined,
    /** 숨김 목록이 화면의 피드 본문보다 앞선 값(저장 응답)이라 본문의 사진 총수가 아직 옛 값이다. */
    overriding: !!current && !current.fromDocument && hiddenIds !== documentHiddenIds,
  };
}
