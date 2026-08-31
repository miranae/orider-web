import { useEffect, useState } from "react";
import { callDeleteBikeProfileAndLayout } from "../features/bikeProfileLayout/client";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useBikeProfiles } from "./useBikeProfiles";
import type { BikeProfile } from "../types/bikeProfile";

export function useActiveBikeProfile(uid: string | null) {
  const { firestore } = useFirebaseServices();
  const {
    profiles,
    loading: profilesLoading,
    updateVirtualPower,
    renameProfile,
    updateWheelCircumference,
    removeSensor,
  } = useBikeProfiles(uid);
  /**
   * 이 브라우저에서 보고 있는 자전거 (#1943 §4, #1950).
   *
   * 예전에는 웹에서 자전거를 고르면 계정 문서의 `activeProfileId` 를 덮어썼다. 그건 **기기 로컬
   * 상태**라, 웹에서 구경만 해도 사용자의 라이딩 기기가 다음 주행에 쓸 자전거가 바뀌었다.
   * 웹의 선택은 웹에만 남기고, 계정 차원의 값은 `defaultProfileId` 로 따로 둔다.
   */
  const [webSelectedId, setWebSelectedId] = useState<string | null>(null);
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null);
  const [stateLoading, setStateLoading] = useState(true);

  // 계정별 키로 저장한다 — 공용 키에 담으면 계정을 바꿔도 이전 계정의 선택이 남는다.
  const selectionKey = uid ? `orider.bikeProfile.webSelected.${uid}` : null;

  useEffect(() => {
    if (!selectionKey) {
      setWebSelectedId(null);
      return;
    }
    try {
      setWebSelectedId(window.localStorage.getItem(selectionKey));
    } catch {
      // 저장소를 못 읽어도 화면은 떠야 한다 — 계정 기본값으로 떨어진다.
      setWebSelectedId(null);
    }
  }, [selectionKey]);

  useEffect(() => {
    if (!uid) {
      setDefaultProfileId(null);
      setStateLoading(false);
      return;
    }
    const ref = doc(firestore, "users", uid, "bikeProfileMeta", "state");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        // `activeProfileId` 는 **기기 로컬** 값이라 계정 기본값으로 읽지 않는다. 다만 아직
        // `defaultProfileId` 를 쓰지 않는 계정이 있어, 없을 때만 힌트로 쓴다.
        setDefaultProfileId(
          (data?.defaultProfileId as string | undefined) ??
            (data?.activeProfileId as string | undefined) ??
            null,
        );
        setStateLoading(false);
      },
      () => {
        setDefaultProfileId(null);
        setStateLoading(false);
      },
    );
    return () => unsub();
  }, [firestore, uid]);

  // 이 브라우저의 선택 → 계정 기본값 → 가장 최근 자전거. 어느 것도 목록에 없으면 첫 항목이다.
  const active: BikeProfile | null =
    profiles.find((p) => p.id === webSelectedId) ??
    profiles.find((p) => p.id === defaultProfileId) ??
    profiles[0] ??
    null;

  /** 웹에서 보고 있는 자전거를 바꾼다 — **이 브라우저에만** 남는다. */
  function setActive(id: string) {
    setWebSelectedId(id);
    if (!selectionKey) return;
    try {
      window.localStorage.setItem(selectionKey, id);
    } catch {
      // 저장에 실패해도 이번 세션의 선택은 유효하다. 다음 방문에 기본값으로 돌아갈 뿐이다.
    }
  }

  /**
   * 계정 기본 자전거를 바꾼다 — **명시적 조작으로만** 부른다.
   *
   * 새 설치가 1회 채택하는 힌트다. 화면을 넘길 때마다 쓰면 웹에서 구경한 것이 다른 기기의
   * 다음 주행 자전거를 바꾸게 된다.
   */
  async function setAccountDefault(id: string) {
    if (!uid) throw new Error("로그인 필요");
    await setDoc(
      doc(firestore, "users", uid, "bikeProfileMeta", "state"),
      { defaultProfileId: id },
      { merge: true },
    );
  }

  /**
   * 프로필 삭제 (#1943 §9.2, #1950).
   *
   * **client hard delete 를 쓰지 않는다.** 프로필만 지우면 형제 레이아웃 문서가 orphan 으로
   * 남고, 다른 기기가 그 레이아웃을 근거로 프로필을 되살린다. 서버 callable 이 프로필과
   * 레이아웃에 **같은 tombstone 을 한 트랜잭션으로** 남긴다.
   *
   * 활성 이동은 삭제 **성공 뒤에** 한다 — 먼저 옮기고 삭제가 실패하면 사용자는 지워지지도
   * 않은 자전거를 두고 활성만 바뀐 상태를 보게 된다.
   */
  async function deleteProfile(id: string) {
    if (!uid) throw new Error("로그인 필요");
    // mutationId 는 재전송이 두 번 삭제하지 않게 하는 멱등 키다.
    await callDeleteBikeProfileAndLayout(id, crypto.randomUUID());
    if (id !== active?.id) return;
    const nextActive = profiles
      .filter((p) => p.id !== id)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!nextActive) return;
    await setDoc(
      doc(firestore, "users", uid, "bikeProfileMeta", "state"),
      { defaultProfileId: nextActive.id },
      { merge: true },
    );
  }

  return {
    active,
    profiles,
    loading: profilesLoading || stateLoading,
    setActive,
    setAccountDefault,
    defaultProfileId,
    updateVirtualPower,
    renameProfile,
    deleteProfile,
    updateWheelCircumference,
    removeSensor,
  };
}
