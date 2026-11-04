import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../Modal";
import { Button } from "../../theme/components";
import { LocalizedLink } from "../LocalizedLink";
import { startSocialAuth, type SocialProvider } from "../../services/socialAuth";

type Provider = "google" | SocialProvider;

interface SignInDialogProps {
  open: boolean;
  onClose: () => void;
  /** Google 팝업 로그인. 성공하면 호출부가 창을 닫는다. */
  onGoogle: () => Promise<void>;
}

export function GoogleLogo() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function NaverLogo() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M13.56 10.7 6.17 0H0v20h6.44V9.3L13.83 20H20V0h-6.44z" fill="currentColor" />
    </svg>
  );
}

export function KakaoLogo() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3C6.48 3 2 6.53 2 10.88c0 2.8 1.86 5.26 4.66 6.65l-.95 3.48c-.08.3.26.55.53.37l4.15-2.75c.53.06 1.07.1 1.61.1 5.52 0 10-3.53 10-7.85S17.52 3 12 3z" fill="currentColor" />
    </svg>
  );
}

/** Discord Clyde symbol from https://discord.com/branding (official vector). */
export function DiscordLogo() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 64 48" aria-hidden="true">
      <path d="M40.575 0C39.9562 1.09866 39.4006 2.2352 38.8954 3.397C34.0967 2.67719 29.2096 2.67719 24.3982 3.397C23.9057 2.2352 23.3374 1.09866 22.7186 0C18.2104 0.770324 13.8157 2.12155 9.64839 4.02841C1.38951 16.2652 -0.845688 28.1863 0.265599 39.9432C5.10222 43.517 10.5197 46.2447 16.2909 47.9874C17.5916 46.2447 18.7407 44.3883 19.7257 42.4562C17.8568 41.7616 16.0509 40.8903 14.3208 39.88C14.7755 39.5517 15.2175 39.2107 15.6468 38.8824C25.7873 43.6559 37.5316 43.6559 47.6847 38.8824C48.1141 39.236 48.5561 39.577 49.0107 39.88C47.2806 40.9029 45.4748 41.7616 43.5931 42.4688C44.5781 44.4009 45.7273 46.2573 47.028 48C52.7991 46.2573 58.2167 43.5422 63.0533 39.9684C64.3666 26.3299 60.8055 14.5099 53.6452 4.04104C49.4905 2.13418 45.0959 0.782952 40.5876 0.0252565L40.575 0ZM21.1401 32.7072C18.0209 32.7072 15.4321 29.8785 15.4321 26.3804C15.4321 22.8824 17.9199 20.041 21.1275 20.041C24.3351 20.041 26.886 22.895 26.8354 26.3804C26.7849 29.8658 24.3224 32.7072 21.1401 32.7072ZM42.1788 32.7072C39.047 32.7072 36.4834 29.8785 36.4834 26.3804C36.4834 22.8824 38.9712 20.041 42.1788 20.041C45.3864 20.041 47.9246 22.895 47.8741 26.3804C47.8236 29.8658 45.3611 32.7072 42.1788 32.7072Z" fill="currentColor"/>
    </svg>
  );
}

const BUTTON_CLASS = "w-full h-12 flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--r-lg)] font-medium transition-opacity disabled:opacity-60";

/** 로그인 방식 선택 — Google 은 팝업, 다른 제공자는 동의 화면으로 이동한다. */
export function SignInDialog({ open, onClose, onGoogle }: SignInDialogProps) {
  const { t } = useTranslation("auth");
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setPending("google");
    setError(null);
    try {
      await onGoogle();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError(t("signIn.failed"));
      }
    } finally {
      setPending(null);
    }
  };

  const handleSocial = async (provider: SocialProvider) => {
    setPending(provider);
    setError(null);
    try {
      await startSocialAuth(provider, "login");
      // 페이지 이동 중 — pending 유지
    } catch (err) {
      const error = err as { code?: string; details?: { reason?: string } } | null;
      const isolatedStrava = provider === "strava" && error?.code === "functions/failed-precondition"
        && error.details?.reason === "strava-isolated-acceptance-required";
      setError(t(isolatedStrava ? "signIn.stravaTestRestricted" : "signIn.failed"));
      setPending(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("signIn.title")} maxWidth="max-w-sm" busy={pending !== null && pending !== "google"}>
      <div data-testid="A1-1" className="flex flex-col gap-3">
        <button data-testid="A1-1-1" type="button" className={`${BUTTON_CLASS} border`} disabled={pending !== null}
          style={{ background: "var(--bg-0)", borderColor: "var(--line-soft)", color: "var(--ink-1)" }}
          onClick={() => { void handleGoogle(); }}>
          <GoogleLogo />{t("signIn.google")}
        </button>
        <button data-testid="A1-1-2" type="button" className={BUTTON_CLASS} disabled={pending !== null}
          style={{ background: "var(--naver)", color: "var(--naver-ink)" }}
          onClick={() => { void handleSocial("naver"); }}>
          <NaverLogo />{t("signIn.naver")}
        </button>
        <button data-testid="A1-1-3" type="button" className={BUTTON_CLASS} disabled={pending !== null}
          style={{ background: "var(--kakao)", color: "var(--kakao-ink)" }}
          onClick={() => { void handleSocial("kakao"); }}>
          <KakaoLogo />{t("signIn.kakao")}
        </button>
        <button data-testid="A1-1-4" type="button" aria-label={t("signIn.strava")}
          className="w-full h-12 flex items-center justify-center rounded-[var(--r-lg)] overflow-hidden disabled:opacity-60"
          style={{ background: "var(--strava-login)" }} disabled={pending !== null}
          onClick={() => { void handleSocial("strava"); }}>
          <img src="/btn_strava_connect_orange.svg" alt="" className="h-12 w-auto" />
        </button>
        <Button data-testid="A1-1-5" variant="discord" size="lg" block
          leadingIcon={<DiscordLogo />} loading={pending === "discord"} disabled={pending !== null}
          onClick={() => { void handleSocial("discord"); }}>
          {t("signIn.discord")}
        </Button>
        {error && <p role="alert" className="text-[length:var(--fs-sm)]" style={{ color: "var(--rose)", margin: 0 }}>{error}</p>}
        <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", margin: 0 }}>{t("signIn.separateAccountHint")}</p>
        <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", margin: 0 }}>
          <LocalizedLink to="/terms" onClick={onClose} className="underline">{t("signIn.terms")}</LocalizedLink>
          {" · "}
          <LocalizedLink to="/privacy" onClick={onClose} className="underline">{t("signIn.privacy")}</LocalizedLink>
        </p>
      </div>
    </Modal>
  );
}
