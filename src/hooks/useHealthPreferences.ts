import { useCallback, useEffect, useState } from "react";
import { deleteField, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import type { HealthPreferences, HealthSport, ProviderId } from "@shared/types";

/**
 * `users/{uid}/health_preferences/main` 문서 read/write.
 *
 * 사용자가 종목별 주 소스 + 영구 보존 토글을 변경할 때 사용. Firestore rules 가
 * 본인 R/W 허용 — 별도 onCall 함수 불필요.
 */
export function useHealthPreferences(uid: string | null) {
  const [prefs, setPrefs] = useState<HealthPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setPrefs(null);
      setLoading(false);
      return;
    }
    const ref = doc(firestore, `users/${uid}/health_preferences/main`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setPrefs(snap.data() as HealthPreferences);
        } else {
          setPrefs({ primarySource: {} });
        }
        setLoading(false);
      },
      (err) => {
        logClientError("useHealthPreferences.subscribe", err, { uid });
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  const setPrimarySource = useCallback(
    async (sport: HealthSport, provider: ProviderId | null) => {
      if (!uid) return;
      const ref = doc(firestore, `users/${uid}/health_preferences/main`);
      // dot-notation update — sibling key 보존 + atomic (Firestore merge 의 nested map
      // 통째 replace 동작 회피). 문서가 없을 수 있으므로 seed 후 update.
      const fieldKey = `primarySource.${sport}` as const;
      // 최초 호출 시 문서 존재 보장
      await setDoc(ref, { primarySource: {} }, { merge: true });
      await updateDoc(ref, {
        [fieldKey]: provider === null ? deleteField() : provider,
        updatedAt: Date.now(),
      });
    },
    [uid],
  );

  const setRetainForever = useCallback(
    async (retain: boolean) => {
      if (!uid) return;
      const ref = doc(firestore, `users/${uid}/health_preferences/main`);
      await setDoc(
        ref,
        {
          retainSamplesForever: retain,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    },
    [uid],
  );

  return { prefs, loading, setPrimarySource, setRetainForever };
}
