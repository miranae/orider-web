import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { isSignInCancelled } from "../../utils/signInCancelled";
import { PermissionGate } from "../redesign";

/** 현재 경로에서 로그인 대화상자를 열어 기존 OAuth/온보딩 복귀 계약을 유지한다. */
export default function ClubLoginGate() {
  const { t } = useTranslation(["group", "common"]);
  const { signIn } = useAuth();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const login = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      await signIn();
    } catch (error) {
      if (!isSignInCancelled(error)) setFailed(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return <PermissionGate
    title={t("public.loginTitle")}
    description={failed ? t("common:auth.loginFailed") : t("error.loginRequiredDesc")}
    actionLabel={t(pending ? "common:auth.loginLoading" : "common:button.login")}
    onAction={() => { void login(); }}
  />;
}
