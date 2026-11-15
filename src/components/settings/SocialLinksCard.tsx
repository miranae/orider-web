import { DiscordLogo } from "../auth/DiscordLogo";
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
import { Resolvable } from "../redesign/states/Resolvable";
import { FOCUS_TARGETS, focusTargetProps, withFocus } from "../../services/focusTarget";

const LOGO: Partial<Record<SocialProvider, () => React.ReactElement>> = { naver: NaverLogo, kakao: KakaoLogo, discord: DiscordLogo };
const GOOGLE_CANCELLED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

/**
 * 네이버·카카오·Strava 계정 연결 (S1-4-1). 서비스마다 회원번호가 달라 같은 사람인지 자동으로 알 수 없으므로,
 * 로그인한 상태에서 사용자가 직접 연결해야 다음부터 그 서비스로 같은 계정에 로그인된다.
 */
/** 「마지막 로그인 수단」 알림 문구를 누르면 아직 연결하지 않은 다른 로그인 수단의 연결 버튼으로 간다. */
const LINK_ANOTHER_LOGIN = { resolve: { to: withFocus("/settings/account", FOCUS_TARGETS.socialLinks) } };

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

  // 조회 세대 — 연결·해제 뒤의 조회나 다시 불러오기가 새로 시작되면 앞선 조회의 늦은 응답은 버린다
  // (해제한 수단이 늦은 응답으로 다시 '연결됨'이 되지 않게).
  const loadGeneration = useRef(0);
  const retrying = useRef(false);
  const load = useCallback(async () => {
    if (!ownerUid) return;
    const generation = ++loadGeneration.current;
    const current = () => ownerRef.current === ownerUid && loadGeneration.current === generation;
    try {
      const links = await listSocialLinks();
      if (!current()) return;
      setLinked({ uid: ownerUid, providers: new Set(links.map((l) => l.provider)) });
      setLoadFailed(false);
    } catch (err) {
      logClientError("SocialLinksCard.list", err);
      if (!current()) return;
      setLoadFailed(true);
    }
  }, [ownerUid]);
  // 실패 문구를 눌러 다시 불러오는 중에는 거듭 눌러도 새로 조회하지 않는다.
  const retryLoad = async () => {
    if (retrying.current) return;
    retrying.current = true;
    try { await load(); } finally { retrying.current = false; }
  };

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
      if (linkedCount === null) showToast(t("pane.account.socialUnlinkFailed"), "error");
      else showToast(t("pane.account.socialUnlinkLast"), "error", LINK_ANOTHER_LOGIN);
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
      if (reason === "last-login-method") showToast(t("pane.account.socialUnlinkLast"), "error", LINK_ANOTHER_LOGIN);
      else showToast(t("pane.account.socialUnlinkFailed"), "error");
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
      if (error.details?.reason === "strava-sync-active") {
        // 활동 동기화를 먼저 끊어야 풀린다 — 알림 문구를 누르면 설정 > 연결된 앱의 Strava 카드로 간다.
        showToast(t("pane.account.stravaSyncActive"), "error", { resolve: { to: "/settings/connections" } });
        return;
      }
      if (error.code === "functions/failed-precondition") showToast(t("pane.account.socialUnlinkLast"), "error", LINK_ANOTHER_LOGIN);
      else showToast(t("pane.account.socialUnlinkFailed"), "error");
    } finally {
      if (ownerRef.current === ownerUid) setPending(null);
    }
  };

  const googleLinked = googleUnlinkedUid !== ownerUid && (hasGoogleLogin(user) || googleLinkedUid === ownerUid);
  // ?focus=social-links 로 들어오면 아직 연결하지 않은 첫 로그인 방법의 연결 버튼에 초점을 둔다.
  // Strava 는 "마지막 로그인 방법" 안내에서 오므로 대상에서 뺀다. 목록을 불러온 뒤에 정한다.
  const focusProvider: SocialProvider | "google" | null = !googleLinked ? "google"
    : linked && linked.uid === ownerUid ? SOCIAL_PROVIDERS.find((provider) => provider !== "strava" && !linked.providers.has(provider)) ?? null : null;
  const focusProps = (provider: SocialProvider | "google") => provider === focusProvider ? focusTargetProps(FOCUS_TARGETS.socialLinks) : {};

  return (
    <SettingsCard data-testid="S1-4-1" title={t("pane.account.cardSocial")} dense>
      {loadFailed && <p role="alert" style={{ color: "var(--rose)", margin: 0 }}><Resolvable resolve={{ onClick: () => void retryLoad() }}>{t("pane.account.socialLoadFailed")}</Resolvable></p>}
      {(() => {
        return (
          <InlineRow data-testid="S1-4-1-google"
            label={<span className="inline-flex items-center gap-2"><GoogleLogo />{t("pane.account.social.google")}</span>}
            hint={t(googleLinked ? "pane.account.socialLinked" : "pane.account.socialNotLinked")}>
            {googleLinked ? (
              <Button variant="secondary" loading={pending === "google"} disabled={pending !== null} onClick={() => { void handleGoogleUnlink(); }}>
                {t("pane.account.socialUnlinkBtn")}
              </Button>
            ) : (
              <Button {...focusProps("google")} variant="secondary" loading={pending === "google"} disabled={pending !== null} onClick={() => { void handleGoogleLink(); }}>
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
              <Button {...focusProps(provider)} variant="secondary" loading={pending === provider} disabled={pending !== null || linked?.uid !== ownerUid} onClick={() => { void handleLink(provider); }}>
                {t("pane.account.socialLinkBtn")}
              </Button>
            )}
          </InlineRow>
        );
      })}
    </SettingsCard>
  );
}
