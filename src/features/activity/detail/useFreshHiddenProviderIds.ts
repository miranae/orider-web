import { useEffect, useState } from "react";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import { logClientError } from "../../../services/errorLogger";
import { hiddenProviderPhotoIds } from "./providerPhotoVisibility";

/**
 * 활동 문서의 Strava 사진 숨김 목록을 탭이 다시 보일 때 새로 읽는다.
 * 활동 상세는 문서를 한 번만 읽으므로, 다른 탭에서 숨기거나 다시 보이게 한 결과가 이 탭에 반영되지 않았다.
 * 숨김을 바꿀 수 있는 사람은 주인뿐이라 주인의 Strava 활동에서만 켠다(enabled). 구독 대신 탭 복귀 때
 * 한 번 읽어 활동 문서의 다른 필드 변경마다 읽기 비용이 생기지 않게 한다.
 * 문서 값(documentHiddenIds)이 바뀌면 새로 읽은 값보다 문서 값을 따른다.
 */
export function useFreshHiddenProviderIds(input: {
  firestore: Firestore; activityId: string | undefined; enabled: boolean; documentHiddenIds: string[];
}): string[] {
  const { firestore, activityId, enabled, documentHiddenIds } = input;
  const base = JSON.stringify(documentHiddenIds);
  const [fresh, setFresh] = useState<{ activityId: string; base: string; ids: string[] } | null>(null);
  useEffect(() => {
    if (!enabled || !activityId || typeof document === "undefined") return;
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      getDoc(doc(firestore, "activities", activityId)).then(snapshot => {
        const data = snapshot.data();
        if (cancelled || !data) return;
        setFresh({ activityId, base, ids: hiddenProviderPhotoIds(data as { userId?: string; hiddenProviderPhotosV1?: unknown }) });
      }).catch(error => logClientError("useFreshHiddenProviderIds.refresh", error, { activityId }));
    };
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", refresh); };
  }, [firestore, activityId, enabled, base]);
  if (!enabled || !fresh || fresh.activityId !== activityId || fresh.base !== base) return documentHiddenIds;
  return JSON.stringify(fresh.ids) === base ? documentHiddenIds : fresh.ids;
}
