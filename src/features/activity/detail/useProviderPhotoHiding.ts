import { useEffect, useRef, useState } from "react";
import type { FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { setProviderPhotosHidden } from "../../../services/nativeActivityPhoto";
import { effectiveHiddenProviderIds, type ProviderHiddenOverride } from "./providerPhotoVisibility";

/**
 * Strava 사진 숨기기·다시 보이기 상태. 저장 직후 서버 응답을 임시로 보여 주되
 * - 활동 문서의 숨김 목록이 저장 당시와 달라지면 임시 값을 버리고 문서를 따른다.
 * - 활동·계정·서비스가 바뀌면 임시 값을 버리고, 그 전에 보낸 요청의 늦은 응답은 적용하지 않는다.
 */
export function useProviderPhotoHiding(input: {
  activityId: string | undefined; uid: string | undefined; services: FirebaseServices; documentHiddenIds: string[];
  onDone: (hidden: boolean) => void; onError: (error: unknown, context: { activityId: string; hidden: boolean; count: number }) => void;
}) {
  const { activityId, uid, services, documentHiddenIds } = input;
  const [override, setOverride] = useState<ProviderHiddenOverride | null>(null);
  const [busy, setBusy] = useState(false);
  const scope = `${activityId ?? ""}|${uid ?? ""}`;
  const generation = useRef({ scope, services, value: 0 });
  if (generation.current.scope !== scope || generation.current.services !== services) {
    generation.current = { scope, services, value: generation.current.value + 1 };
  }
  const callbacks = useRef(input); callbacks.current = input;
  useEffect(() => { setOverride(null); setBusy(false); }, [scope, services]);
  const documentKey = JSON.stringify(documentHiddenIds);
  // 문서 숨김 목록이 바뀔 때마다 올라가는 번호. 요청 중에 한 번이라도 바뀌었으면(원래 값으로 돌아왔더라도)
  // 그 응답은 이미 문서가 더 새로운 상태이므로 임시 값으로 쓰지 않는다.
  const documentVersion = useRef({ key: documentKey, value: 0 });
  if (documentVersion.current.key !== documentKey) documentVersion.current = { key: documentKey, value: documentVersion.current.value + 1 };
  useEffect(() => { if (override && override.base !== documentKey) setOverride(null); }, [override, documentKey]);

  const change = async (photoIds: string[], hidden: boolean) => {
    if (!activityId || !photoIds.length || busy) return;
    const target = activityId, requestUid = uid, requestGeneration = generation.current.value, base = documentKey;
    const requestDocumentVersion = documentVersion.current.value;
    const current = () => generation.current.value === requestGeneration;
    setBusy(true);
    try {
      const ids = await setProviderPhotosHidden(services, target, photoIds, hidden);
      if (!current()) return;
      if (documentVersion.current.value === requestDocumentVersion) setOverride({ activityId: target, uid: requestUid, base, ids });
      callbacks.current.onDone(hidden);
    } catch (error) {
      callbacks.current.onError(error, { activityId: target, hidden, count: photoIds.length });
    } finally { if (current()) setBusy(false); }
  };
  const hiddenIds = activityId ? effectiveHiddenProviderIds(documentHiddenIds, override, activityId, uid) : documentHiddenIds;
  return { hiddenIds, overriding: hiddenIds !== documentHiddenIds, busy, change };
}
