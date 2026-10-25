import { startJourneyMeasurement } from "../../services/journeyMeasurement";
import { useEffect, useState } from "react";
import { Button, Stack, Text } from "../../theme/components";
import { EmptyState } from "../../components/redesign";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady, functions } from "../../services/firebase";
import { appCheckFailureRecovery } from "../../services/appCheckFailureRecovery";
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
  const { user, loading: authLoading, signIn } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [joinError, setJoinError] = useState<"invalid" | "failed" | null>(null);

  const [retryAt, setRetryAt] = useState(0);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(() => setRetryAt(0), Math.min(Math.max(0, retryAt - Date.now()), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [retryAt]);

  const uid = user?.uid;
  const isAnonymous = user?.isAnonymous === true;
  const inviteCode = normalizeGroupInviteCode(code);
  useEffect(() => {
    if (inviteCode) startJourneyMeasurement("share_open", "web_club_invite", "open")("success");
  }, [inviteCode]);
  useEffect(() => {
    if (authLoading || !uid || isAnonymous || !inviteCode) return;
    const finish = startJourneyMeasurement("club_join", "web_club_invite", "join");
    let cancelled = false;
    const current = () => !cancelled && auth.currentUser?.uid === uid && auth.currentUser.isAnonymous !== true;
    setProcessing(true);
    setJoinError(null);
    setRetryAt(0);

    ensureAppCheckReady()
      .then(() => current() ? httpsCallable<{ inviteCode: string }, JoinGroupByCodeResult>(functions, "joinGroupByCode")({ inviteCode }) : undefined)
      .then((result) => {
        if (!current() || !result) return;
        if (isPendingGroupJoinResult(result.data)) {
          finish("success");
          showToast(t("join.pendingToast"));
          navigate("/clubs", { replace: true });
          return;
        }
        const groupId = result.data.groupId;
        if (!groupId) throw new Error("Missing group id");
        finish("success");
        showToast(t("inviteLink.joined"));
        navigate(`/club/${groupId}`, { replace: true });
      })
      .catch((err) => {
        if (!current()) return;
        finish(err?.code === "functions/permission-denied" ? "access_denied" : "error");
        // The invite code is a join credential: do not copy it into diagnostics.
        logClientError("GroupInvitePage.join", err);
        const invalid = !["functions/permission-denied", "functions/unauthenticated"].includes(err?.code)
          && (err?.code === "functions/not-found" || err?.message === "Invalid invite code" || err?.message === "Invalid or expired invite code"
            || (err?.code === "functions/invalid-argument" && err?.message === "유효한 초대 코드가 필요합니다."));
        const recovery = appCheckFailureRecovery(err);
        if (recovery?.waitMs) setRetryAt(Date.now() + recovery.waitMs);
        setJoinError(invalid ? "invalid" : "failed");
      })
      .finally(() => { if (current()) setProcessing(false); });
    return () => { cancelled = true; finish("cancelled"); };
  }, [authLoading, inviteCode, navigate, showToast, t, uid, isAnonymous, attempt]);

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

  if (user && !isAnonymous && processing) {
    return <InviteSpinner label={t("inviteLink.joining")} />;
  }

  if (!user || isAnonymous) {
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
          <Button variant="secondary"
            onClick={signIn}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--r-lg)] shadow-sm transition-colors border"
            style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)" }}
          >
            <span className="font-medium" style={{ color: "var(--ink-1)" }}>
              {t("inviteLink.signInGoogle")}
            </span>
          </Button>
        </div>
      </div>
    );
  }

  if (joinError) return <div className="max-w-xl mx-auto py-16">
    <Stack gap="var(--space-4)">
      <Text as="h1" variant="subtitle">{t("inviteLink.title")}</Text>
      <Text role="alert">{t(joinError === "invalid" ? "error.invalidInviteCode" : "inviteLink.retryMessage")}</Text>
      {retryAt > 0 && <Text>{t("error.joinVerificationWait", { count: Math.ceil((retryAt - Date.now()) / 60_000) })}</Text>}
      {joinError === "failed" && <Button disabled={retryAt > 0} onClick={() => setAttempt(value => value + 1)}>{t("inviteLink.retry")}</Button>}
      <Button variant="ghost" onClick={() => navigate("/clubs")}>{t("subNav.groupList")}</Button>
    </Stack>
  </div>;
  return null;
}
