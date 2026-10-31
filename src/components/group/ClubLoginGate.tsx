import { useTranslation } from "react-i18next";
import { useInPlaceSignIn } from "../../hooks/useInPlaceSignIn";
import { PermissionGate } from "../redesign";

/** 현재 경로에서 로그인 대화상자를 열어 기존 OAuth/온보딩 복귀 계약을 유지한다. */
export default function ClubLoginGate() {
  const { t } = useTranslation(["group", "common"]);
  const { login, pending, failed } = useInPlaceSignIn();
  return <PermissionGate
    title={t("public.loginTitle")}
    description={failed ? t("common:auth.loginFailed") : t("error.loginRequiredDesc")}
    actionLabel={t(pending ? "common:auth.loginLoading" : "common:button.login")}
    onAction={() => { void login(); }}
  />;
}
