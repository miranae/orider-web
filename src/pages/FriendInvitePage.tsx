import { useFirebaseServices, type FirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityDiscovery } from "../services/activityDiscovery";
import { useEffect, useState } from "react";
import { resolveFriendInvitePreview } from "../services/friendInvitePreview";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useAuth } from "../contexts/AuthContext";
import { useFriends } from "../hooks/useFriends";
import { useToast } from "../contexts/ToastContext";
import { logClientError } from "../services/errorLogger";
import { Button, Card } from "../theme/components";

interface InvitePreview {
  userId: string;
  nickname: string;
  photoURL: string | null;
  rideImageUrl: string | null;
}

async function loadRecentRideImage(services: FirebaseServices, userId: string): Promise<string | null> {
  try {
    const page = await loadActivityDiscovery(services, { scope: "athlete", targetUid: userId, limit: 8 });
    return page.items.find(activity => activity.mapImageUrl)?.mapImageUrl ?? null;
  } catch (err) {
    logClientError("FriendInvitePage.recentRidePreview", err, { userId });
    return null;
  }
}

async function loadInvitePreview(services: FirebaseServices, code: string): Promise<InvitePreview | null> {
  const profile = await resolveFriendInvitePreview(services, code);
  if (!profile) return null;
  const rideImageUrl = await loadRecentRideImage(services, profile.userId);
  return { ...profile, rideImageUrl };
}

export default function FriendInvitePage() {
  const services = useFirebaseServices();
  const { code } = useParams<{ code: string }>();
  const { t } = useTranslation("friends");
  const { user, loading: authLoading, signIn } = useAuth();
  const signedIn = !!user && !user.isAnonymous;
  const { addByCode, actionLoading } = useFriends();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [previewState, setPreviewState] = useState<{ user: typeof user; code: typeof code; value: InvitePreview } | null>(null);
  const invitePreview = previewState?.user === user && previewState?.code === code ? previewState.value : null;
  const setInvitePreview = (value: InvitePreview | null) => setPreviewState(value ? { user, code, value } : null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || !code || processed || processing) return;
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
        navigate("/athlete/me/friends", { replace: true });
      })
      .catch((err: any) => {
        const code = typeof err?.code === "string" ? err.code : "";
        const message = code.includes("not-found")
          ? t("invite.errorNotFound")
          : code.includes("invalid-argument")
            ? t("invite.errorInvalid")
            : t("invite.errorFailed");
        setInviteError(message);
        showToast(message, "error");
        setProcessed(true);
      })
      .finally(() => setProcessing(false));
  }, [user, signedIn, code, processed]);

  useEffect(() => {
    let generation = 0;
    let stopped = false;
    setInvitePreview(null);
    if (!code || signedIn) return;
    const refresh = () => {
      const request = ++generation;
      if (document.visibilityState === "hidden") { setInvitePreview(null); return; }
      void loadInvitePreview(services, code).then(preview => {
        if (!stopped && request === generation) setInvitePreview(preview);
      }).catch(err => {
        if (!stopped && request === generation) setInvitePreview(null);
        logClientError("FriendInvitePage.invitePreview", err);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { stopped = true; generation++; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [code, user, signedIn, services]);

  if (authLoading) {
    return (
      <div data-testid="P3.loading" className="flex items-center justify-center min-h-[60vh]">
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

  if (signedIn && (processing || actionLoading)) {
    return (
      <div data-testid="P3-4" className="flex items-center justify-center min-h-[60vh]">
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

  if (signedIn && inviteError) {
    return (
      <div data-testid="P3-4" className="flex items-center justify-center min-h-[60vh]">
        <Card data-testid="P3-4-1" className="max-w-sm text-center" padding="card">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--rose)]/10 text-[var(--rose)] flex items-center justify-center">
            !
          </div>
          <h1 className="text-[length:var(--fs-lg)] font-bold mb-2 text-[var(--ink-0)]">
            {t("invite.errorTitle")}
          </h1>
          <p className="mb-5 text-[length:var(--fs-sm)] text-[var(--ink-2)]">
            {inviteError}
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              type="button"
              onClick={() => {
                setInviteError(null);
                setProcessed(false);
              }}
            >
              {t("invite.retry")}
            </Button>
            <button
              type="button"
              onClick={() => navigate("/athlete/me/friends", { replace: true })}
              className="px-4 py-2 text-[length:var(--fs-sm)] font-medium rounded-[var(--r-lg)] text-[var(--ink-1)]"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line-soft)" }}
            >
              {t("invite.backToFriends")}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div data-testid="P3-4" className="flex items-center justify-center min-h-[60vh]">
        <div data-testid="P3-4-1" className="text-center max-w-sm mx-auto px-4">
          {invitePreview?.rideImageUrl && (
            <div
              className="mb-4 overflow-hidden rounded-[var(--r-lg)] border border-[var(--line-soft)]"
              style={{ aspectRatio: "2.6 / 1", background: "var(--bg-2)" }}
            >
              <img
                src={invitePreview.rideImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="w-16 h-16 mx-auto mb-4 bg-[var(--bg-2)] rounded-full flex items-center justify-center overflow-hidden">
            {invitePreview?.photoURL ? (
              <img src={invitePreview.photoURL} alt="" className="h-full w-full object-cover" />
            ) : (
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
            )}
          </div>
          <h1 className="text-[length:var(--fs-xl)] font-bold mb-2" style={{ color: "var(--ink-0)" }}>
            {invitePreview
              ? t("invite.titleWithName", { nickname: invitePreview.nickname })
              : t("invite.title")}
          </h1>
          <p className="mb-6" style={{ color: "var(--ink-2)" }}>
            {invitePreview
              ? t("invite.loginPromptWithName", { nickname: invitePreview.nickname })
              : t("invite.loginPrompt")}
          </p>
          <button
            onClick={signIn}
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
