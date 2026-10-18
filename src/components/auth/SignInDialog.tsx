import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../Modal";
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

const BUTTON_CLASS = "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--r-lg)] font-medium transition-opacity disabled:opacity-60";

/** 로그인 방식 선택 — Google 은 팝업, 네이버·카카오는 동의 화면으로 이동한다. */
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
    } catch {
      setError(t("signIn.failed"));
      setPending(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("signIn.title")} maxWidth="max-w-sm" busy={pending !== null && pending !== "google"}>
      <div data-testid="A1-1" className="flex flex-col gap-3">
        <p className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)", margin: 0 }}>{t("signIn.description")}</p>
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
        {error && <p role="alert" className="text-[length:var(--fs-sm)]" style={{ color: "var(--rose)", margin: 0 }}>{error}</p>}
        <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)", margin: 0 }}>{t("signIn.separateAccountHint")}</p>
      </div>
    </Modal>
  );
}
