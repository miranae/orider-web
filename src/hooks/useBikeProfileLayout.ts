import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import type { DataPageConfig, LayoutConfig } from "@shared/types/deviceSettings";

import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { parseCanonicalLayout } from "../features/bikeProfileLayout/canonical";
import type { CanonicalLayout } from "../features/bikeProfileLayout/canonical";
import { browserSaveDeps } from "../features/bikeProfileLayout/client";
import { readHead } from "../features/bikeProfileLayout/outbox";
import { defaultCanonicalLayout, toCanonical, toRenderable } from "../features/bikeProfileLayout/renderable";
import { saveBikeProfileLayout } from "../features/bikeProfileLayout/saveLayout";
import type { SaveLayoutResult } from "../features/bikeProfileLayout/saveLayout";

/** 지금 보고 있는 구성이 어디서 왔는가 (#1943 §6.1). */
export type LayoutSource =
  /** 저장된 canonical 레코드. */
  | "canonical"
  /** 아직 저장된 적 없는 자전거 — 화면은 기본 구성을 보여 주지만 **레코드는 없다**. */
  | "unsaved"
  /** 레코드는 있는데 읽지 못했다. 이 상태의 저장은 원문을 덮어쓴다. */
  | "quarantined";

export type BikeProfileLayoutState = {
  config: DataPageConfig | null;
  source: LayoutSource;
  revision: number;
  loading: boolean;
  /** 임시 표시본 위에서는 저장을 막는다 — 보존해야 할 원문을 정상 데이터로 덮어쓴다. */
  canSave: boolean;
  save: (pages: LayoutConfig[]) => Promise<SaveLayoutResult>;
};

/**
 * 한 자전거의 데이터 페이지 구성 (#1943 §9.1, #1950).
 *
 * **로컬 head 가 원격보다 우선한다.** 아직 전송되지 않은 편집이 로컬에 있는데 원격을 그리면,
 * 사용자는 방금 저장한 구성이 사라진 것으로 본다.
 */
export function useBikeProfileLayout(
  uid: string | null,
  profileId: string | null,
  fallbackPages: LayoutConfig[],
): BikeProfileLayoutState {
  const { firestore } = useFirebaseServices();
  const ownerKey = uid ? `uid:${uid}` : null;
  /**
   * 상태는 **어느 자전거의 것인지와 함께** 들고 다닌다 (#1950 리뷰 BLOCKER).
   *
   * 대상이 바뀌었는데 이전 자전거의 record/revision 이 남아 있으면, 새 스냅샷이 도착하기 전에
   * `save` 가 **새 profileId + 이전 자전거의 base·revision** 조합으로 나간다. 가져오기 마법사가
   * 그 구간에 확인을 받으면 미리보기와 실제 덮어쓰는 대상이 달라진다 — 되돌릴 수 없다.
   */
  const [state, setState] = useState<{
    profileId: string | null;
    record: CanonicalLayout | null;
    revision: number;
    source: LayoutSource;
    loading: boolean;
  }>({ profileId: null, record: null, revision: 0, source: "unsaved", loading: true });

  // 대상이 바뀐 순간 이전 자전거의 상태는 더 이상 유효하지 않다. 렌더 중에 버려야 같은 커밋에서
  // `canSave` 가 열려 있는 창이 생기지 않는다.
  if (state.profileId !== profileId) {
    setState({ profileId, record: null, revision: 0, source: "unsaved", loading: profileId !== null });
  }

  const { record, revision, source } = state;
  const loading = state.loading;

  useEffect(() => {
    if (!uid || !profileId || !ownerKey) {
      setState({ profileId, record: null, revision: 0, source: "unsaved", loading: false });
      return;
    }
    let cancelled = false;

    const apply = (raw: string | null, nextRevision: number) => {
      if (cancelled) return;
      if (!raw) {
        setState({ profileId, record: null, revision: 0, source: "unsaved", loading: false });
        return;
      }
      const parsed = parseCanonicalLayout(raw, "CYCLING");
      setState(
        parsed.ok
          ? { profileId, record: parsed.layout, revision: nextRevision, source: "canonical", loading: false }
          // 읽지 못한 레코드를 기본 구성으로 **대신 보여 주되**, 저장은 막는다. 그대로 쓰면
          // 보존해야 할 원문이 정상 데이터로 덮인다(§8.2).
          : { profileId, record: null, revision: nextRevision, source: "quarantined", loading: false },
      );
    };

    const unsub = onSnapshot(
      doc(firestore, "users", uid, "bikeProfileLayouts", profileId),
      (snap) => {
        void (async () => {
          // 로컬이 더 새로우면 로컬을 쓴다 — 전송 대기 중인 편집을 원격이 되돌리면 안 된다.
          const local = await readHead(ownerKey, profileId).catch(() => null);
          const data = snap.data();
          const remoteRevision = (data?.revision as number | undefined) ?? 0;
          const remotePayload = (data?.payload as string | undefined) ?? null;
          if (local && local.revision >= remoteRevision) {
            apply(local.canonicalPayload, local.revision);
            return;
          }
          apply(remotePayload, remoteRevision);
        })();
      },
      () => {
        void (async () => {
          // 원격을 못 읽어도 로컬이 있으면 그걸 그린다. 둘 다 없으면 "아직 없음" 이다.
          const local = await readHead(ownerKey, profileId).catch(() => null);
          apply(local?.canonicalPayload ?? null, local?.revision ?? 0);
        })();
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [firestore, uid, profileId, ownerKey]);

  const config = useMemo(() => {
    if (record) return toRenderable(record);
    if (!profileId) return null;
    return { pages: fallbackPages };
  }, [record, profileId, fallbackPages]);

  const save = useCallback(
    async (pages: LayoutConfig[]): Promise<SaveLayoutResult> => {
      if (!ownerKey || !profileId) {
        return { status: "localSaveFailed", cause: new Error("로그인 필요") };
      }
      // 이 상태가 **이 자전거의 것**이고 조회가 끝났을 때만 쓴다. 아니면 새 profileId 에
      // 이전 자전거의 base·revision 을 실어 보내게 된다(#1950 리뷰 BLOCKER).
      if (state.profileId !== profileId || state.loading) {
        return { status: "localSaveFailed", cause: new Error("아직 이 자전거의 구성을 읽는 중입니다") };
      }
      // 원본 레코드에서 sport·unknownKeys 를 이어받는다 — 새로 만들면 상위 버전 데이터를 지운다.
      const base = record ?? defaultCanonicalLayout(profileId, pages);
      return saveBikeProfileLayout(
        { ownerKey, profileId, layout: toCanonical(pages, base), expectedRevision: revision },
        browserSaveDeps(),
      );
    },
    [ownerKey, profileId, record, revision, state.profileId, state.loading],
  );

  return {
    config,
    source,
    revision,
    loading,
    // 조회 중에는 저장을 열지 않는다 — 그 창에서 저장하면 대상과 base 가 어긋난다.
    canSave: source !== "quarantined" && !loading && state.profileId === profileId,
    save,
  };
}
