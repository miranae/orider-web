import { useEffect, useState } from "react";
import { EmptyState } from "../../components/redesign";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { normalizeGroupInviteCode } from "../../features/group/groupInviteLink";
import { isPendingGroupJoinResult, type JoinGroupByCodeResult } from "../../features/group/groupJoinResult";

function InviteSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <svg className="w-8 h-8 mx-auto mb-3 animate-spin text-[color:var(--lime)]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p style={{ color: "var(--ink-2)" }}>{label}</p>
      </div>
    </div>
  );
}

export default function GroupInvitePage() {
  const { code } = useParams<{ code: string }>();
  const { t } = useTranslation("group");
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(false);

  const uid = user?.uid;
  const inviteCode = normalizeGroupInviteCode(code);
  useEffect(() => {
    if (!uid || !inviteCode || processed) return;
    let cancelled = false;
    const current = () => !cancelled && auth.currentUser?.uid === uid;
    setProcessing(true);

    ensureAppCheckReady()
      .then(() => current() ? httpsCallable<{ inviteCode: string }, JoinGroupByCodeResult>(functions, "joinGroupByCode")({ inviteCode }) : undefined)
      .then((result) => {
        if (!current() || !result) return;
        if (isPendingGroupJoinResult(result.data)) {
          showToast(t("join.pendingToast"));
          setProcessed(true);
          navigate("/clubs", { replace: true });
          return;
        }
        const groupId = result.data.groupId;
        if (!groupId) throw new Error("Missing group id");
        showToast(t("inviteLink.joined"));
        setProcessed(true);
        navigate(`/club/${groupId}`, { replace: true });
      })
      .catch((err) => {
        if (!current()) return;
        logClientError("GroupInvitePage.join", err, { inviteCode });
        showToast((!["functions/permission-denied", "functions/unauthenticated"].includes(err?.code) && (err?.code === "functions/not-found" || err?.message === "Invalid invite code" || err?.message === "Invalid or expired invite code" || (err?.code === "functions/invalid-argument" && err?.message === "유효한 초대 코드가 필요합니다."))) ? t("error.invalidInviteCode") : t("error.joinFailed"), "error");
        setProcessed(true);
        navigate("/clubs", { replace: true });
      })
      .finally(() => { if (current()) setProcessing(false); });
    return () => { cancelled = true; };
  }, [inviteCode, navigate, processed, showToast, t, uid]);

  if (authLoading) {
    return <InviteSpinner label={t("inviteLink.loading")} />;
  }

  if (!inviteCode) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <EmptyState
          title={t("error.invalidInviteCode")}
          actions={[{ label: t("subNav.groupList"), href: "/clubs", variant: "primary" }]}
        />
      </div>
    );
  }

  if (user && processing) {
    return <InviteSpinner label={t("inviteLink.joining")} />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm mx-auto px-4">
          <div className="w-16 h-16 mx-auto mb-4 bg-[var(--bg-2)] rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-[color:var(--lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2.13a4 4 0 10-8 0 4 4 0 008 0zm6 0a4 4 0 10-8 0" />
            </svg>
          </div>
          <h1 className="text-[length:var(--fs-xl)] font-bold mb-2" style={{ color: "var(--ink-0)" }}>
            {t("inviteLink.title")}
          </h1>
          <p className="mb-6" style={{ color: "var(--ink-2)" }}>
            {t("inviteLink.loginPrompt")}
          </p>
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--r-lg)] shadow-sm transition-colors border"
            style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)" }}
          >
            <span className="font-medium" style={{ color: "var(--ink-1)" }}>
              {t("inviteLink.signInGoogle")}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
