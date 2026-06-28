import { LocalizedLink as Link } from "../components/LocalizedLink";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import Avatar from "../components/Avatar";
import { Text } from "../theme/components";

export default function MyPage() {
  const { user, profile, logout } = useAuth();
  const { t } = useTranslation("mypage");

  if (!user) {
    return (
      <div style={{ padding: "var(--space-8) var(--space-6)", textAlign: "center", color: "var(--ink-4)", fontSize: "var(--fs-sm)" }}>
        {t("loginRequired")}
      </div>
    );
  }

  const nickname = profile?.nickname || user.displayName || t("defaultNickname");
  const stravaConnected = !!profile?.stravaAthleteId;

  return (
    <div>
      {/* Profile section */}
      <div
        className="flex items-center gap-3.5"
        style={{ padding: "var(--space-5) var(--space-4)", borderBottom: "1px solid var(--line-soft)" }}
      >
        <Avatar userId={user.uid} name={nickname} imageUrl={user.photoURL || profile?.photoURL} size="lg" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>
            {nickname}
          </div>
          {stravaConnected && (
            <div className="flex items-center gap-1" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 2 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#FC4C02">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              {t("stravaConnected")}
            </div>
          )}
        </div>
        <Link
          to={`/athlete/${user.uid}`}
          style={{
            padding: "6px 14px", background: "transparent", border: "1px solid var(--line)",
            borderRadius: "var(--r-md)", fontSize: "var(--fs-xs)", color: "var(--ink-2)", textDecoration: "none",
          }}
        >
          {t("edit")}
        </Link>
      </div>

      {/* Stats row */}
      <div
        className="grid grid-cols-3"
        style={{ borderBottom: "1px solid var(--line-soft)" }}
      >
        {[
          { label: t("stats.followers"), value: "—" },
          { label: t("stats.following"), value: "—" },
          { label: t("stats.activities"), value: profile?.stats?.activityCount ?? 0 },
        ].map((s) => (
          <div
            key={s.label}
            style={{ padding: "14px 0", textAlign: "center", borderRight: "1px solid var(--line-soft)" }}
          >
            <Text as="div" variant="num" style={{ fontSize: "var(--fs-xl)", color: "var(--ink-0)" }}>
              {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </Text>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 운동 섹션은 "내 운동" 허브(피트니스/계획/기록)로 분리됨(#385) — MY 에서 제거해 중복 해소. */}

      {/* 계정 section */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t("section.account")}</Text>
      </div>
      {[
        { label: t("menu.settings"), icon: "⚙️", to: "/settings" },
        { label: t("menu.strava"), icon: "🔗", to: "/settings" },
        { label: t("menu.manual"), icon: "📖", to: "/terms" },
      ].map((item) => (
        <Link
          key={item.label}
          to={item.to}
          className="flex items-center gap-3"
          style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none" }}
        >
          <span style={{ fontSize: "var(--fs-lg)", width: 28, textAlign: "center" }}>{item.icon}</span>
          <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-1)", fontWeight: 500, flex: 1 }}>{item.label}</span>
          <ChevronRight size={16} style={{ color: "var(--ink-4)" }} />
        </Link>
      ))}
      {/* Logout — inside 계정 section, no chevron */}
      <div
        onClick={logout}
        className="flex items-center gap-3 cursor-pointer"
        style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)" }}
      >
        <span style={{ fontSize: "var(--fs-lg)", width: 28, textAlign: "center" }}>🚪</span>
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--rose)", fontWeight: 500, flex: 1 }}>{t("menu.logout")}</span>
      </div>

      <div style={{ height: 80 }} />
    </div>
  );
}
