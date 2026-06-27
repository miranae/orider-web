import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useAuth } from "../contexts/AuthContext";
import { useFriends } from "../hooks/useFriends";
import { useToast } from "../contexts/ToastContext";

export default function FriendInvitePage() {
  const { code } = useParams<{ code: string }>();
  const { t } = useTranslation("friends");
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { addByCode, actionLoading } = useFriends();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(false);

  useEffect(() => {
    if (!user || !code || processed || processing) return;
    setProcessing(true);
    addByCode(code, "invite_link")
      .then((result) => {
        if (result?.alreadyFriends) {
          showToast(t("toast.alreadyFriends"));
        } else if (result?.success) {
          showToast(
            t("toast.added", { nickname: result.friendNickname || t("defaultNickname") })
          );
        }
        setProcessed(true);
        navigate("/friends", { replace: true });
      })
      .catch((err: any) => {
        showToast(err?.message || t("toast.addFailed"), "error");
        setProcessed(true);
        navigate("/friends", { replace: true });
      })
      .finally(() => setProcessing(false));
  }, [user, code, processed]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <svg
            className="w-8 h-8 mx-auto mb-3 animate-spin text-[color:var(--lime)]"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p style={{ color: "var(--ink-2)" }}>{t("invite.loading")}</p>
        </div>
      </div>
    );
  }

  if (user && (processing || actionLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <svg
            className="w-8 h-8 mx-auto mb-3 animate-spin text-[color:var(--lime)]"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p style={{ color: "var(--ink-2)" }}>
            {t("invite.adding")}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm mx-auto px-4">
          <div className="w-16 h-16 mx-auto mb-4 bg-[var(--bg-2)] rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[color:var(--lime)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </div>
          <h1 className="text-[length:var(--fs-xl)] font-bold mb-2" style={{ color: "var(--ink-0)" }}>
            {t("invite.title")}
          </h1>
          <p className="mb-6" style={{ color: "var(--ink-2)" }}>
            {t("invite.loginPrompt")}
          </p>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--r-lg)] shadow-sm transition-colors border"
            style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span className="font-medium" style={{ color: "var(--ink-1)" }}>
              {t("invite.signInGoogle")}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
