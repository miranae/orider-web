import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { logClientError } from "../../services/errorLogger";
import { listSocialLinks, SOCIAL_PROVIDERS, startSocialAuth, unlinkSocial, type SocialProvider } from "../../services/socialAuth";
import { Button } from "../../theme/components";
import { KakaoLogo, NaverLogo } from "../auth/SignInDialog";
import { InlineRow, SettingsCard } from "./_primitives";

const LOGO: Record<SocialProvider, () => React.ReactElement> = { naver: NaverLogo, kakao: KakaoLogo };

/**
 * 네이버·카카오 계정 연결 (S1-4-1). 서비스마다 회원번호가 달라 같은 사람인지 자동으로 알 수 없으므로,
 * 로그인한 상태에서 사용자가 직접 연결해야 다음부터 그 서비스로 같은 계정에 로그인된다.
 */
export function SocialLinksCard() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const { showToast } = useToast();
  const dialog = useDialog();
  const [linked, setLinked] = useState<Set<SocialProvider> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<SocialProvider | null>(null);

  const load = useCallback(async () => {
    try {
      const links = await listSocialLinks();
      setLinked(new Set(links.map((l) => l.provider)));
      setLoadFailed(false);
    } catch (err) {
      logClientError("SocialLinksCard.list", err);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (user && !user.isAnonymous) void load();
  }, [user, load]);

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

  const handleUnlink = async (provider: SocialProvider) => {
    if (!(await dialog.confirm(t("pane.account.socialUnlinkConfirm", { provider: t(`pane.account.social.${provider}`) }), { destructive: true }))) return;
    setPending(provider);
    try {
      await unlinkSocial(provider);
      await load();
    } catch (err) {
      logClientError("SocialLinksCard.unlink", err, { provider });
      const code = (err as { code?: string })?.code;
      showToast(t(code === "functions/failed-precondition" ? "pane.account.socialUnlinkLast" : "pane.account.socialUnlinkFailed"), "error");
    } finally {
      setPending(null);
    }
  };

  return (
    <SettingsCard data-testid="S1-4-1" title={t("pane.account.cardSocial")} dense>
      {loadFailed && <p role="alert" style={{ color: "var(--rose)", margin: 0 }}>{t("pane.account.socialLoadFailed")}</p>}
      {SOCIAL_PROVIDERS.map((provider) => {
        const Logo = LOGO[provider];
        const isLinked = linked?.has(provider) ?? false;
        return (
          <InlineRow key={provider} data-testid={`S1-4-1-${provider}`}
            label={<span className="inline-flex items-center gap-2"><Logo />{t(`pane.account.social.${provider}`)}</span>}
            hint={isLinked ? t("pane.account.socialLinked") : t("pane.account.socialNotLinked")}>
            {isLinked ? (
              <Button variant="secondary" loading={pending === provider} disabled={pending !== null} onClick={() => { void handleUnlink(provider); }}>
                {t("pane.account.socialUnlinkBtn")}
              </Button>
            ) : (
              <Button variant="secondary" loading={pending === provider} disabled={pending !== null || linked === null} onClick={() => { void handleLink(provider); }}>
                {t("pane.account.socialLinkBtn")}
              </Button>
            )}
          </InlineRow>
        );
      })}
    </SettingsCard>
  );
}
