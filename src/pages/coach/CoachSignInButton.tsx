import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { isSignInCancelled } from "../../utils/signInCancelled";
import { useToast } from "../../contexts/ToastContext";
import { Button } from "../../theme/components";

export default function CoachSignInButton() {
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
  return <Button disabled={pending} loading={pending} onClick={() => { void handleSignIn(); }}>{t("auth.loginValue")}</Button>;
}
