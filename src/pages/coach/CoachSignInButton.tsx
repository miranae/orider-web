import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { Button } from "../../theme/components";

export default function CoachSignInButton() {
  const { t } = useTranslation("common");
  const { signInWithGoogle } = useAuth();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  async function signIn() {
    if (pending) return;
    setPending(true);
    try {
      await signInWithGoogle();
    } catch {
      showToast(t("auth.loginFailed"), "error");
    } finally {
      setPending(false);
    }
  }
  return <Button disabled={pending} loading={pending} onClick={() => { void signIn(); }}>{t("auth.loginValue")}</Button>;
}
