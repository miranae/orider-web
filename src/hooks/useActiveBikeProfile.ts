import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { useBikeProfiles } from "./useBikeProfiles";
import type { BikeProfile } from "../types/bikeProfile";

export function useActiveBikeProfile(uid: string | null) {
  const {
    profiles,
    loading: profilesLoading,
    updateVirtualPower,
    renameProfile,
    updateWheelCircumference,
    removeSensor,
  } = useBikeProfiles(uid);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stateLoading, setStateLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setActiveId(null);
      setStateLoading(false);
      return;
    }
    const ref = doc(firestore, "users", uid, "bikeProfileMeta", "state");
    const unsub = onSnapshot(ref, (snap) => {
      setActiveId((snap.data()?.activeProfileId as string | undefined) ?? null);
      setStateLoading(false);
    });
    return () => unsub();
  }, [uid]);

  const active: BikeProfile | null =
    profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;

  async function setActive(id: string) {
    if (!uid) throw new Error("로그인 필요");
    await setDoc(
      doc(firestore, "users", uid, "bikeProfileMeta", "state"),
      { activeProfileId: id },
      { merge: true },
    );
  }

  /**
   * 활성 프로필을 삭제할 경우, 모바일 앱이 dangling activeProfileId를 갖지 않도록
   * 다른 프로필(가장 최근 updatedAt)로 활성을 옮긴 뒤 삭제. setActive와 deleteDoc은
   * `writeBatch`로 묶어 부분 실패와 onSnapshot 전파 사이 race를 차단한다.
   * 마지막 1개 가드는 호출 측(`canDelete`)이 책임진다.
   */
  async function deleteProfile(id: string) {
    if (!uid) throw new Error("로그인 필요");
    const batch = writeBatch(firestore);
    if (id === activeId) {
      const nextActive = profiles
        .filter((p) => p.id !== id)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (nextActive) {
        batch.set(
          doc(firestore, "users", uid, "bikeProfileMeta", "state"),
          { activeProfileId: nextActive.id },
          { merge: true },
        );
      }
    }
    batch.delete(doc(firestore, "users", uid, "bikeProfiles", id));
    await batch.commit();
  }

  return {
    active,
    profiles,
    loading: profilesLoading || stateLoading,
    setActive,
    updateVirtualPower,
    renameProfile,
    deleteProfile,
    updateWheelCircumference,
    removeSensor,
  };
}
