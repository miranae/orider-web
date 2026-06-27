/**
 * 바이크 킷 장비 관리 훅 (#286).
 * Firestore `users/{uid}/gear/{gearId}` 에 직접 CRUD.
 * 시뮬레이터(#287)는 여기서 읽어간 gear 아이템의 cda/crr/drivetrainEfficiency 필드를 사용한다.
 */
import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { firestore } from "../services/firebase";
import type { Gear } from "@shared/types";

export type GearInput = Omit<Gear, "id" | "createdAt" | "updatedAt">;

export function useGear(uid: string | null) {
  const [items, setItems] = useState<Gear[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(firestore, "users", uid, "gear"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Gear, "id">) })),
      );
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  async function addGear(input: GearInput): Promise<string> {
    if (!uid) throw new Error("로그인 필요");
    const ref = await addDoc(collection(firestore, "users", uid, "gear"), {
      ...input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return ref.id;
  }

  async function updateGear(id: string, patch: Partial<GearInput>): Promise<void> {
    if (!uid) throw new Error("로그인 필요");
    await updateDoc(doc(firestore, "users", uid, "gear", id), {
      ...patch,
      updatedAt: Date.now(),
    });
  }

  async function removeGear(id: string): Promise<void> {
    if (!uid) throw new Error("로그인 필요");
    await deleteDoc(doc(firestore, "users", uid, "gear", id));
  }

  return { items, loading, addGear, updateGear, removeGear };
}
