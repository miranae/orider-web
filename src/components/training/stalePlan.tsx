import type { TFunction } from "i18next";
import type { useDialog } from "../../contexts/DialogContext";
import { Resolvable } from "../redesign";

/**
 * 연 날짜가 서버 계획과 더 이상 맞지 않을 때 던진다(다른 기기·코치 조정으로 주 계획이 바뀜).
 * 다시 시도해도 같은 이유로 계속 실패하므로 일반 실패 안내와 구분한다.
 */
export class StalePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StalePlanError";
  }
}

/**
 * 계획 저장 실패 안내. 계획이 바뀐 경우엔 일반 「다시 시도」 대신 진짜 원인 문구를 보여 주고,
 * 그 문구를 누르면 `refresh`(호출부의 기존 재조회 — 편집창을 닫고 최신 주 계획을 다시 불러온다)를 부른다.
 * 토스트는 훈련 편집창 뒤에 깔려 보이지 않아 기존 경고창을 그대로 쓴다.
 */
export function alertPlanSaveFailure(
  err: unknown,
  dialog: ReturnType<typeof useDialog>,
  t: TFunction,
  fallbackMessage: string,
  refresh: () => void,
): void {
  const message = err instanceof StalePlanError
    ? <Resolvable resolve={{ onClick: refresh }}>{t("edit.staleDay")}</Resolvable>
    : fallbackMessage;
  void dialog.alert(message, { variant: "danger" });
}
