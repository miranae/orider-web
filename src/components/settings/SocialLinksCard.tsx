import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { logClientError } from "../../services/errorLogger";
import { listSocialLinks, SOCIAL_PROVIDERS, startSocialAuth, unlinkSocial, type SocialProvider } from "../../services/socialAuth";
import { canUnlinkGoogle, hasGoogleLogin, linkGoogleToCurrentUser, unlinkGoogleFromCurrentUser } from "../../services/googleLink";
import { Button } from "../../theme/components";
import { LocalizedLink } from "../LocalizedLink";
import { GoogleLogo, KakaoLogo, NaverLogo } from "../auth/SignInDialog";
import { InlineRow, SettingsCard } from "./_primitives";

const LOGO: Partial<Record<SocialProvider, () => React.ReactElement>> = { naver: NaverLogo, kakao: KakaoLogo };
const GOOGLE_CANCELLED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

/**
 * 네이버·카카오·Strava 계정 연결 (S1-4-1). 서비스마다 회원번호가 달라 같은 사람인지 자동으로 알 수 없으므로,
 * 로그인한 상태에서 사용자가 직접 연결해야 다음부터 그 서비스로 같은 계정에 로그인된다.
 */
export function SocialLinksCard() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const { showToast } = useToast();
  const dialog = useDialog();
  const ownerUid = user && !user.isAnonymous ? user.uid : null;
  const ownerRef = useRef(ownerUid);
  ownerRef.current = ownerUid;
  const [linked, setLinked] = useState<{ uid: string; providers: Set<SocialProvider> } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<SocialProvider | "google" | null>(null);
  // linkWithCredential 뒤 reload 는 같은 User 객체를 바꾸므로 화면 갱신용으로 연결 결과를 따로 둔다.
  const [googleLinkedUid, setGoogleLinkedUid] = useState<string | null>(null);
  // unlink 뒤 reload 도 같은 User 객체를 바꾸므로 해제 결과도 따로 둔다.
  const [googleUnlinkedUid, setGoogleUnlinkedUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ownerUid) return;
    try {
      const links = await listSocialLinks();
      if (ownerRef.current !== ownerUid) return;
      setLinked({ uid: ownerUid, providers: new Set(links.map((l) => l.provider)) });
      setLoadFailed(false);
    } catch (err) {
      if (ownerRef.current !== ownerUid) return;
      logClientError("SocialLinksCard.list", err);
      setLoadFailed(true);
    }
  }, [ownerUid]);

  useEffect(() => {
    setLinked(null);
    setLoadFailed(false);
    setPending(null);
    if (ownerUid) void load();
  }, [ownerUid, load]);

  if (!user || user.isAnonymous) return null;

  const handleLink = async (provider: SocialProvider) => {
    setPending(provider);
    try {
      await startSocialAuth(provider, "link", "/settings/account");
    } catch {
      showToast(t("pane.account.socialLinkFailed"), "error");
      setPending(null);
    }
  };

  const handleGoogleLink = async () => {
    setPending("google");
    try {
      const result = await linkGoogleToCurrentUser(() => dialog.confirm(t("pane.account.googleConnectExisting.description"), {
        title: t("pane.account.googleConnectExisting.title"), confirmLabel: t("pane.account.googleConnectExisting.confirm"),
      }));
      if (ownerRef.current !== ownerUid) return;
      if (result !== "cancelled") {
        setGoogleLinkedUid(ownerUid);
        setGoogleUnlinkedUid(null);
        showToast(t("pane.account.googleLinked"), "success");
      }
    } catch (err) {
      const error = err as { code?: string; details?: { reason?: string } };
      if (GOOGLE_CANCELLED.has(error.code ?? "")) return;
      // 계정이 바뀌었어도 인증·callable 실패는 기록한다. 화면 갱신만 생략한다.
      const accountChanged = ownerRef.current !== ownerUid;
      logClientError("SocialLinksCard.googleLink", err, { code: error.code ?? null, reason: error.details?.reason ?? null, accountChanged });
      if (accountChanged) return;
      const key = error.details?.reason === "social-account-data-conflict" ? "pane.account.googleConnectDataConflict"
        : error.details?.reason === "google-already-linked" ? "pane.account.googleAlreadyLinked" : "pane.account.googleLinkFailed";
      showToast(t(key), "error");
    } finally {
      if (ownerRef.current === ownerUid) setPending(null);
    }
  };

  const handleGoogleUnlink = async () => {
    if (!user) return;
    const linkedCount = linked?.uid === ownerUid ? linked.providers.size : null;
    if (!canUnlinkGoogle(user, linkedCount)) {
      showToast(t(linkedCount === null ? "pane.account.socialUnlinkFailed" : "pane.account.socialUnlinkLast"), "error");
      return;
    }
    if (!(await dialog.confirm(t("pane.account.socialUnlinkConfirm", { provider: t("pane.account.social.google") }), { destructive: true }))) return;
    if (ownerRef.current !== ownerUid) return;
    setPending("google");
    try {
      await unlinkGoogleFromCurrentUser();
      if (ownerRef.current !== ownerUid) return;
      setGoogleUnlinkedUid(ownerUid);
      setGoogleLinkedUid(null);
      showToast(t("pane.account.googleUnlinked"), "success");
    } catch (err) {
      const error = err as { code?: string };
      if (GOOGLE_CANCELLED.has(error.code ?? "")) return;
      // 계정이 바뀌었어도 실패는 기록한다. 화면 갱신만 생략한다.
      const accountChanged = ownerRef.current !== ownerUid;
      logClientError("SocialLinksCard.googleUnlink", err, { code: error.code ?? null, accountChanged });
      if (accountChanged) return;
      const reason = (err as { details?: { reason?: string } }).details?.reason;
      showToast(t(reason === "last-login-method" ? "pane.account.socialUnlinkLast" : "pane.account.socialUnlinkFailed"), "error");
    } finally {
      if (ownerRef.current === ownerUid) setPending(null);
    }
  };

  const handleUnlink = async (provider: SocialProvider) => {
    if (!(await dialog.confirm(t(provider === "strava" ? "pane.account.stravaUnlinkConfirm" : "pane.account.socialUnlinkConfirm", { provider: t(`pane.account.social.${provider}`) }), { destructive: true }))) return;
    if (ownerRef.current !== ownerUid) return;
    setPending(provider);
    try {
      await unlinkSocial(provider);
      if (ownerRef.current !== ownerUid) return;
      await load();
    } catch (err) {
      if (ownerRef.current !== ownerUid) return;
      logClientError("SocialLinksCard.unlink", err, { provider });
      const error = err as { code?: string; details?: { reason?: string } };
      const key = error.details?.reason === "strava-sync-active" ? "pane.account.stravaSyncActive"
        : error.code === "functions/failed-precondition" ? "pane.account.socialUnlinkLast" : "pane.account.socialUnlinkFailed";
      showToast(t(key), "error");
    } finally {
      if (ownerRef.current === ownerUid) setPending(null);
    }
  };

  return (
    <SettingsCard data-testid="S1-4-1" title={t("pane.account.cardSocial")} dense>
      {loadFailed && <p role="alert" style={{ color: "var(--rose)", margin: 0 }}>{t("pane.account.socialLoadFailed")}</p>}
      {(() => {
        const googleLinked = googleUnlinkedUid !== ownerUid && (hasGoogleLogin(user) || googleLinkedUid === ownerUid);
        return (
          <InlineRow data-testid="S1-4-1-google"
            label={<span className="inline-flex items-center gap-2"><GoogleLogo />{t("pane.account.social.google")}</span>}
            hint={t(googleLinked ? "pane.account.socialLinked" : "pane.account.socialNotLinked")}>
            {googleLinked ? (
              <Button variant="secondary" loading={pending === "google"} disabled={pending !== null} onClick={() => { void handleGoogleUnlink(); }}>
                {t("pane.account.socialUnlinkBtn")}
              </Button>
            ) : (
              <Button variant="secondary" loading={pending === "google"} disabled={pending !== null} onClick={() => { void handleGoogleLink(); }}>
                {t("pane.account.socialLinkBtn")}
              </Button>
            )}
          </InlineRow>
        );
      })()}
      {SOCIAL_PROVIDERS.map((provider) => {
        const Logo = LOGO[provider];
        const isLinked = linked?.uid === ownerUid && linked.providers.has(provider);
        return (
          <InlineRow key={provider} data-testid={`S1-4-1-${provider}`}
            label={<span className="inline-flex items-center gap-2">{Logo && <Logo />}{t(`pane.account.social.${provider}`)}</span>}
            hint={<>{t(isLinked ? "pane.account.socialLinked" : "pane.account.socialNotLinked")}{provider === "strava" && <> {t("pane.account.stravaLoginHint")} <LocalizedLink to="/settings/connections" className="underline">{t("pane.account.stravaSyncSettings")}</LocalizedLink></>}</>}>
            {isLinked ? (
              <Button variant="secondary" loading={pending === provider} disabled={pending !== null} onClick={() => { void handleUnlink(provider); }}>
                {t("pane.account.socialUnlinkBtn")}
              </Button>
            ) : (
              <Button variant="secondary" loading={pending === provider} disabled={pending !== null || linked?.uid !== ownerUid} onClick={() => { void handleLink(provider); }}>
                {t("pane.account.socialLinkBtn")}
              </Button>
            )}
          </InlineRow>
        );
      })}
    </SettingsCard>
  );
}
