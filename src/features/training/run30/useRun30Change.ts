import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { logClientError } from "../../../services/errorLogger";
import {
  run30ServerMessage,
  type Run30Api,
  type Run30ChangeAction,
  type Run30ChangePreview,
  type Run30ChangeRequest,
  type Run30Program,
} from "./run30Api";

export type Run30ChangePhase = "idle" | "previewing" | "ready" | "confirming";

export interface Run30ChangeState {
  phase: Run30ChangePhase;
  pendingAction: Run30ChangeAction | null;
  preview: Run30ChangePreview | null;
  /** 미리보기 실패 — 동작 버튼 아래에 인라인으로 표시한다. */
  previewError: string | null;
  /** 확인 실패 — 대화상자 안에 표시한다. */
  confirmError: string | null;
  requestPreview: (action: Run30ChangeAction, stage: number, toLocalDate?: string) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => void;
}

/** 모든 일정 변경은 서버 미리보기 → 사용자 확인 → 서버 확정 순서로만 진행한다. */
export function useRun30Change(
  api: Run30Api,
  program: Run30Program,
  onChanged: () => Promise<void>,
): Run30ChangeState {
  const { t } = useTranslation("training");
  const [phase, setPhase] = useState<Run30ChangePhase>("idle");
  const [pendingAction, setPendingAction] = useState<Run30ChangeAction | null>(null);
  const [preview, setPreview] = useState<Run30ChangePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const requestRef = useRef<Run30ChangeRequest | null>(null);
  const attempt = useRef(0);

  const describe = useCallback((error: unknown) => run30ServerMessage(error) ?? t("run30.errors.generic"), [t]);

  const requestPreview = useCallback(async (action: Run30ChangeAction, stage: number, toLocalDate?: string) => {
    const current = ++attempt.current;
    const request: Run30ChangeRequest = {
      goalId: program.goalId,
      expectedRevision: program.revision,
      action,
      stage,
      ...(action === "postpone" || action === "retry" ? { toLocalDate } : {}),
    };
    requestRef.current = request;
    setPendingAction(action);
    setPreview(null);
    setPreviewError(null);
    setConfirmError(null);
    setPhase("previewing");
    try {
      const next = await api.previewChange(request);
      if (attempt.current !== current) return;
      setPreview(next);
      setPhase("ready");
    } catch (error) {
      if (attempt.current !== current) return;
      logClientError("Run30.previewChange", error, { action, stage });
      setPreviewError(describe(error));
      setPendingAction(null);
      setPhase("idle");
    }
  }, [api, describe, program.goalId, program.revision]);

  const confirm = useCallback(async () => {
    const request = requestRef.current;
    if (!request || !preview || phase !== "ready") return;
    const current = attempt.current;
    setConfirmError(null);
    setPhase("confirming");
    try {
      // proposalId 는 미리보기와 같은 입력으로만 성립한다(서버가 해시로 재검증).
      await api.confirmChange({ ...request, proposalId: preview.proposalId });
      if (attempt.current !== current) return;
      await onChanged();
      if (attempt.current !== current) return;
      requestRef.current = null;
      setPreview(null);
      setPendingAction(null);
      setPhase("idle");
    } catch (error) {
      if (attempt.current !== current) return;
      logClientError("Run30.confirmChange", error, { action: request.action, stage: request.stage });
      setConfirmError(describe(error));
      setPhase("ready");
    }
  }, [api, describe, onChanged, phase, preview]);

  const cancel = useCallback(() => {
    attempt.current += 1;
    requestRef.current = null;
    setPreview(null);
    setPendingAction(null);
    setConfirmError(null);
    setPhase("idle");
  }, []);

  return { phase, pendingAction, preview, previewError, confirmError, requestPreview, confirm, cancel };
}
