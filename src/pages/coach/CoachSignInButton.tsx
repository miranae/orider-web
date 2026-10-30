import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { isSignInCancelled } from "../../utils/signInCancelled";
import { useToast } from "../../contexts/ToastContext";
import { Button } from "../../theme/components";

/** label 을 주면 기본 문구(기록을 저장하려면 로그인) 대신 쓴다 — 화면 맥락에 맞는 행동 문구용 */
export default function CoachSignInButton({ label }: { label?: string } = {}) {
  const { t } = useTranslation("common");
  const { signIn } = useAuth();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  async function handleSignIn() {
    if (pending) return;
    setPending(true);
    try {
      await signIn();
    } catch (err) {
      if (!isSignInCancelled(err)) showToast(t("auth.loginFailed"), "error");
    } finally {
      setPending(false);
    }
  }
  return <Button disabled={pending} loading={pending} onClick={() => { void handleSignIn(); }}>{label ?? t("auth.loginValue")}</Button>;
}
