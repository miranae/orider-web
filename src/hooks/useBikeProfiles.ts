import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { firestore } from "../services/firebase";
import {
  type BikeProfile,
  parseBikeProfile,
  type VirtualPowerConfig,
} from "../types/bikeProfile";

export function useBikeProfiles(uid: string | null) {
  const [profiles, setProfiles] = useState<BikeProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setProfiles([]);
      setLoading(false);
      return;
    }
    const ref = collection(firestore, "users", uid, "bikeProfiles");
    const unsub = onSnapshot(ref, (snap) => {
      setProfiles(snap.docs.map((d) => parseBikeProfile(d.id, d.data())));
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  async function updateVirtualPower(profileId: string, vp: Partial<VirtualPowerConfig>) {
    if (!uid) throw new Error("로그인 필요");
    const ref = doc(firestore, "users", uid, "bikeProfiles", profileId);
    await setDoc(
      ref,
      { virtualPower: vp, updatedAt: Date.now() },
      { merge: true },
    );
  }

  async function renameProfile(profileId: string, name: string) {
    if (!uid) throw new Error("로그인 필요");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("이름을 입력해 주세요");
    const ref = doc(firestore, "users", uid, "bikeProfiles", profileId);
    await setDoc(ref, { name: trimmed, updatedAt: Date.now() }, { merge: true });
  }

  async function deleteProfile(profileId: string) {
    if (!uid) throw new Error("로그인 필요");
    const ref = doc(firestore, "users", uid, "bikeProfiles", profileId);
    await deleteDoc(ref);
  }

  async function updateWheelCircumference(profileId: string, mm: number) {
    if (!uid) throw new Error("로그인 필요");
    if (!Number.isFinite(mm) || mm < 1000 || mm > 3000) {
      throw new Error("휠 둘레는 1000~3000mm 범위여야 합니다");
    }
    const ref = doc(firestore, "users", uid, "bikeProfiles", profileId);
    await setDoc(
      ref,
      { wheelCircumferenceMm: mm, updatedAt: Date.now() },
      { merge: true },
    );
  }

  /**
   * 자전거 프로필에서 특정 deviceAddress의 센서를 제거.
   * 같은 type 여러 개 등록되어 있어도 deviceAddress 하나만 정확히 지운다.
   */
  async function removeSensor(profileId: string, deviceAddress: string) {
    if (!uid) throw new Error("로그인 필요");
    const target = profiles.find((p) => p.id === profileId);
    if (!target) throw new Error("자전거 프로필을 찾을 수 없습니다");
    const nextSensors = target.sensors.filter(
      (s) => s.deviceAddress !== deviceAddress,
    );
    const ref = doc(firestore, "users", uid, "bikeProfiles", profileId);
    await setDoc(
      ref,
      { sensors: nextSensors, updatedAt: Date.now() },
      { merge: true },
    );
  }

  return {
    profiles,
    loading,
    updateVirtualPower,
    renameProfile,
    deleteProfile,
    updateWheelCircumference,
    removeSensor,
  };
}
