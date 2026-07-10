import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme, type ThemePreference } from "../../contexts/ThemeContext";
import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { useStrava } from "../../hooks/useStrava";
import { LanguageToggle } from "../i18n/LanguageToggle";
import { useLocale } from "../../contexts/LocaleContext";
import { Text } from "../../theme/components";

function secsToMmss(secs?: number | null): string {
  if (!secs || secs <= 0) return "—";
  const min = Math.floor(secs / 60);
  const sec = Math.round(secs % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default function MobileSettingsPage() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { units, setUnits } = useLocale();
  const { showToast } = useToast();
  const dialog = useDialog();
  const { connectStrava, deleteUserData, loading: stravaLoading } = useStrava();
  const stravaConnected = !!profile?.stravaAthleteId || !!profile?.stravaConnected;

  const trainingMetrics = [
    [t("training.ftp"), profile?.ftp ? `${profile.ftp} W` : "—"],
    [t("training.weight"), profile?.weightKg ? `${profile.weightKg} kg` : "—"],
    [t("training.maxHr"), profile?.maxHr ? `${profile.maxHr} bpm` : "—"],
    [t("training.thresholdPace"), secsToMmss(profile?.thresholdPace)],
    [t("training.css"), secsToMmss(profile?.css)],
  ];

  // 데스크톱 PaneAccount.handleDeleteAccount(파일: src/components/settings/PaneAccount.tsx:193) 미러링.
  // 확인 대화상자 → stravaDeleteUserData CF(deleteUserData) 호출 → 결과 토스트.
  const handleDeleteAccount = async () => {
    if (!(await dialog.confirm(t("data.deleteConfirm"), { destructive: true }))) return;
    try {
      await deleteUserData();
      showToast(t("pane.account.deleteAccountDone"));
    } catch (e) {
      showToast(`${t("pane.account.deleteAccountFailed")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center sticky top-0 z-10"
        style={{ height: 52, background: "var(--bg-1)", borderBottom: "1px solid var(--line-soft)", padding: "0 16px", gap: "var(--space-2)" }}>
        <div className="cursor-pointer flex items-center" style={{ marginLeft: -4, padding: "4px 8px 4px 0", minHeight: 44 }}
          onClick={() => navigate("/my")}>
          <ChevronLeft size={22} style={{ color: "var(--ink-1)" }} />
        </div>
        <span style={{ fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>{t("title")}</span>
      </div>

      {/* 계정 */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("section.account")}</Text>
      </div>
      {[
        [t("profile.nickname"), profile?.nickname || "—"],
        [t("account.email"), profile?.email || "—"],
      ].map(([l, v]) => (
        <div key={l} className="flex items-center gap-3" style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)" }}>{l}</div>
          </div>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{v}</span>
        </div>
      ))}

      {/* 훈련 기준값 */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("nav.trainingLabel")}</Text>
      </div>
      <Link to="/settings?section=training" className="flex items-center gap-3"
        style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)" }}>{t("nav.trainingHint")}</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 3 }}>
            {trainingMetrics.map(([label, value]) => `${label}: ${value}`).join(" · ")}
          </div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--ink-4)" }} />
      </Link>

      {/* 연동 */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("section.integrations")}</Text>
      </div>
      <button
        type="button"
        onClick={() => {
          if (stravaConnected) {
            navigate("/settings?section=connections");
          } else {
            connectStrava("/settings");
          }
        }}
        disabled={stravaLoading}
        className="flex items-center gap-3"
        style={{ width: "100%", padding: "13px 16px", border: 0, borderBottom: "1px solid var(--line-soft)", background: "transparent", textAlign: "left", cursor: stravaLoading ? "wait" : "pointer", opacity: stravaLoading ? 0.65 : 1 }}
      >
        <span style={{ fontSize: "var(--fs-lg)", width: 28, textAlign: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#FC4C02"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)" }}>{t("strava.stravaShort")}</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 1 }}>
            {stravaConnected ? t("strava.autoSyncStatus") : t("strava.notConnected")}
          </div>
        </div>
        <span style={{ fontSize: "var(--fs-xs)", color: stravaConnected ? "var(--strava)" : "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
          {stravaConnected ? t("strava.connected") : t("strava.connect")}
        </span>
        <ChevronRight size={16} style={{ color: "var(--ink-4)" }} />
      </button>

      {/* 알림 */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("section.notifications")}</Text>
        <span style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", padding: "2px 6px", borderRadius: "var(--r-xs)", background: "var(--bg-3)", color: "var(--ink-4)" }}>{t("notifications.preparing")}</span>
      </div>
      {[
        t("notifications.push"),
        t("notifications.email"),
        t("notifications.newFollower"),
        t("notifications.kudosComment"),
        t("notifications.prRecord"),
      ].map((item) => (
        <div key={item} className="flex items-center gap-3" style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)" }}>
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-3)", flex: 1 }}>{item}</span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>{t("notifications.preparing")}</span>
        </div>
      ))}

      {/* 개인정보 */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("section.personalInfo")}</Text>
      </div>
      {[
        [t("privacy.activityVisibility"), profile?.defaultVisibility === "friends" ? t("privacy.friendsValue") : t("privacy.publicValue")],
        [t("privacy.profileVisibility"), profile?.profilePublic !== false ? t("privacy.publicValue") : t("privacy.privateValue")],
      ].map(([l, v]) => (
        <div key={l} className="flex items-center gap-3" style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)" }}>
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)", flex: 1 }}>{l}</span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{v}</span>
        </div>
      ))}

      {/* 표시 (테마) */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("section.display")}</Text>
      </div>
      <div style={{ padding: "10px 16px 14px", borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{t("theme.label")}</div>
        <div style={{ display: "flex", gap: "var(--space-1-5)" }}>
          {([
            { id: "system", label: t("theme.system") },
            { id: "light", label: t("theme.light") },
            { id: "dark", label: t("theme.dark") },
          ] as { id: ThemePreference; label: string }[]).map((opt) => {
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  fontSize: "var(--fs-xs)",
                  fontWeight: 500,
                  borderRadius: "var(--r-md)",
                  background: active ? "var(--bg-3)" : "var(--bg-2)",
                  color: active ? "var(--ink-0)" : "var(--ink-3)",
                  border: `1px solid ${active ? "var(--ink-3)" : "var(--line-soft)"}`,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 언어 및 단위 */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("section.localeUnits")}</Text>
      </div>
      <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{t("locale.label")}</div>
        <LanguageToggle variant="menu" />
      </div>
      <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)" }}>
        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)", marginBottom: 'var(--space-2)' }}>{t("units.label")}</div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-1)" }}>
            <input
              type="radio"
              name="mobile-units"
              checked={units === "metric"}
              onChange={() => setUnits("metric")}
              style={{ accentColor: "var(--lime)" }}
            />
            <span>{t("units.metric")}</span>
          </label>
          <label className="flex items-center gap-2" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-1)" }}>
            <input
              type="radio"
              name="mobile-units"
              checked={units === "imperial"}
              onChange={() => setUnits("imperial")}
              style={{ accentColor: "var(--lime)" }}
            />
            <span>{t("units.imperial")}</span>
          </label>
        </div>
      </div>

      {/* 기타 */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("section.etc")}</Text>
      </div>
      {[
        { label: t("links.terms"), to: "/terms" },
        { label: t("links.privacy"), to: "/privacy" },
        { label: t("links.community"), to: "/community" },
      ].map((item) => (
        <Link key={item.label} to={item.to} className="flex items-center gap-3"
          style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none" }}>
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)", flex: 1 }}>{item.label}</span>
          <ChevronRight size={16} style={{ color: "var(--ink-4)" }} />
        </Link>
      ))}

      {/* 계정 삭제 */}
      <div style={{ padding: "var(--space-5) var(--space-4)", borderTop: "1px solid var(--line-soft)", marginTop: 'var(--space-3)' }}>
        <button
          onClick={handleDeleteAccount}
          disabled={stravaLoading}
          style={{
            width: "100%", padding: 'var(--space-3)', background: "transparent",
            border: "1px solid color-mix(in oklch, var(--rose) 40%, var(--line))",
            borderRadius: "var(--r-md)", color: "var(--rose)", fontSize: "var(--fs-sm)", fontWeight: 500,
            cursor: stravaLoading ? "wait" : "pointer", opacity: stravaLoading ? 0.6 : 1,
          }}
        >
          {stravaLoading ? t("pane.account.deleteBtnDeleting") : t("pane.account.deleteBtnLabel")}
        </button>
      </div>

      <div style={{ height: 80 }} />
    </div>
  );
}
