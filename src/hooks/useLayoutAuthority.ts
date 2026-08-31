import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { useFirebaseServices } from "../contexts/FirebaseServicesContext";

/**
 * 이 계정이 canonical 로 이관됐는지 (#1943 §10, #1950).
 *
 * 첫 canonical write 가 서버에서 marker 를 만든다. **영구 marker 로만 판정한다** — 레이아웃
 * 문서 개수로 판정하면 마지막 자전거를 지운 순간 legacy 편집이 다시 열려, 구버전 구성이
 * canonical 을 덮을 수 있다.
 *
 * 못 읽으면 **이관된 것으로 본다.** 아니라고 보면 legacy 쓰기를 다시 열어 되돌릴 수 없는
 * 덮어쓰기가 되지만, 이관됐다고 보면 읽기 전용 안내에 머물다 다음 조회에서 회복된다.
 */
export function useLayoutAuthority(uid: string | null): { migrated: boolean; loading: boolean } {
  const { firestore } = useFirebaseServices();
  const [migrated, setMigrated] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      // 로그인하지 않았으면 계정 이관 개념이 없다 — legacy 화면을 막을 이유도 없다.
      setMigrated(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(firestore, "bikeProfileLayoutAuthorities", uid),
      (snap) => {
        setMigrated(snap.exists());
        setLoading(false);
      },
      () => {
        setMigrated(true);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [firestore, uid]);

  return { migrated, loading };
}
