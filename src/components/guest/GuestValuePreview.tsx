import { standaloneText } from "../../i18n/standaloneText";
import { useState } from "react";
import { LocalizedLink as Link } from "../LocalizedLink";
import { useAuth } from "../../contexts/AuthContext";
import { isSignInCancelled } from "../../utils/signInCancelled";
import { useToast } from "../../contexts/ToastContext";
import { Button, Card, Text, buttonClass } from "../../theme/components";

type PreviewKind = "fitness" | "plan" | "log";

interface GuestValuePreviewProps {
  kind: PreviewKind;
  lang?: string;
}

const FITNESS_POINTS = [
  { day: "D-21", ctl: 38, atl: 44, tsb: -6 },
  { day: "D-14", ctl: 43, atl: 52, tsb: -9 },
  { day: "D-7", ctl: 49, atl: 58, tsb: -8 },
  { day: "Today", ctl: 53, atl: 46, tsb: 7 },
];

const PLAN_DAYS = [
  { weekdayOffset: 0, titleKey: "guest_preview_recovery" as const, tss: 22 },
  { weekdayOffset: 1, titleKey: "guest_preview_tempo" as const, tss: 68 },
  { weekdayOffset: 3, titleKey: "guest_preview_intervals" as const, tss: 92 },
  { weekdayOffset: 5, titleKey: "guest_preview_long_ride" as const, tss: 118 },
];

const LOG_DAYS = [
  { d: "03", km: 42, tss: 64 },
  { d: "06", km: 78, tss: 118 },
  { d: "10", km: 31, tss: 47 },
  { d: "13", km: 94, tss: 142 },
  { d: "17", km: 25, tss: 34 },
  { d: "20", km: 66, tss: 96 },
];

function copy(kind: PreviewKind, lang?: string) {
  const shared = {
    badge: standaloneText(lang ?? "ko", "guest_preview_demo_data"),
    cta: standaloneText(lang ?? "ko", "guest_preview_sign_in_to_use_my_data"),
    tools: standaloneText(lang ?? "ko", "guest_preview_open_public_calculator"),
    note: standaloneText(lang ?? "ko", "guest_preview_after_sign_in_this_same_surface_switches"),
  };
  if (kind === "fitness") {
    return {
      ...shared,
      title: standaloneText(lang ?? "ko", "guest_preview_fitness_curve_preview"),
      desc: standaloneText(lang ?? "ko", "guest_preview_preview_load_fatigue_and_form_with_ctl"),
      metric: standaloneText(lang ?? "ko", "guest_preview_today_form"),
    };
  }
  if (kind === "plan") {
    return {
      ...shared,
      title: standaloneText(lang ?? "ko", "guest_preview_weekly_plan_preview"),
      desc: standaloneText(lang ?? "ko", "guest_preview_see_how_workload_and_recovery_days_are"),
      metric: standaloneText(lang ?? "ko", "guest_preview_week_target"),
    };
  }
  return {
    ...shared,
    title: standaloneText(lang ?? "ko", "guest_preview_training_log_preview"),
    desc: standaloneText(lang ?? "ko", "guest_preview_preview_monthly_distance_tss_and_key_sessions"),
    metric: standaloneText(lang ?? "ko", "guest_preview_monthly_log"),
  };
}

export default function GuestValuePreview({ kind, lang }: GuestValuePreviewProps) {
  const c = copy(kind, lang);
  const weekday = new Intl.DateTimeFormat(lang ?? "ko", { weekday: "short", timeZone: "UTC" });
  const isFitness = kind === "fitness";
  const isPlan = kind === "plan";
  const { signIn } = useAuth();
  const { showToast } = useToast();
  const [signInPending, setSignInPending] = useState(false);

  async function handleSignIn() {
    if (signInPending) return;
    setSignInPending(true);
    try {
      // 팝업 로그인은 현재 페이지를 유지하고, 차단 시 Firebase redirect도 같은 URL로 돌아온다.
      await signIn();
    } catch (err) {
      if (!isSignInCancelled(err)) showToast(standaloneText(lang ?? "ko", "guest_preview_sign_in_failed_please_try_again"), "error");
    } finally {
      setSignInPending(false);
    }
  }

  return (
    // 좌우는 페이지 셸 거터만 쓴다 — 목표·분석 탭과 같은 정렬선.
    <div className="site-shell" style={{ paddingBlock: "48px 64px" }}>
      <Card padding="none" style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ maxWidth: 640 }}>
            <Text as="div" variant="eyebrow" style={{ color: "var(--lime)", marginBottom: "var(--space-2)" }}>{c.badge}</Text>
            <Text as="h1" variant="pageTitle" style={{ margin: 0 }}>{c.title}</Text>
            <p style={{ marginTop: "var(--space-2)", color: "var(--ink-3)", fontSize: "var(--fs-sm)", lineHeight: 1.7 }}>{c.desc}</p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" loading={signInPending} onClick={() => { void handleSignIn(); }}>{c.cta}</Button>
            <Link to="/tools/virtual-power" className={buttonClass({ variant: "secondary", size: "sm" })}>{c.tools}</Link>
          </div>
        </div>

        {isFitness ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: "var(--space-3)" }}>
            {FITNESS_POINTS.map((p) => (
              <div key={p.day} style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: "var(--space-4)", background: "var(--bg-2)" }}>
                <Text as="div" variant="eyebrow">{p.day}</Text>
                <Text variant="dataMedium" style={{ color: "var(--lime)" }}>{p.ctl}</Text>
                <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginLeft: "var(--space-1)" }}>CTL</span>
                <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
                  <span>ATL {p.atl}</span>
                  <span>TSB {p.tsb > 0 ? `+${p.tsb}` : p.tsb}</span>
                </div>
              </div>
            ))}
          </div>
        ) : isPlan ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: "var(--space-3)" }}>
            {PLAN_DAYS.map((d) => (
              <div key={d.weekdayOffset} style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: "var(--space-4)", background: "var(--bg-2)" }}>
                <Text as="div" variant="eyebrow">{weekday.format(Date.UTC(2024, 0, 1 + d.weekdayOffset))}</Text>
                <div style={{ marginTop: "var(--space-2)", fontWeight: 700, color: "var(--ink-0)" }}>{standaloneText(lang ?? "ko", d.titleKey)}</div>
                <Text variant="dataMedium" style={{ color: "var(--amber)" }}>{d.tss}</Text>
                <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginLeft: "var(--space-1)" }}>TSS</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 80px), 1fr))", gap: "var(--space-2)" }}>
            {LOG_DAYS.map((d) => (
              <div key={d.d} style={{ minHeight: 96, border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: "var(--space-3)", background: "var(--bg-2)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <Text as="div" variant="eyebrow">{d.d}</Text>
                <div>
                  <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", fontWeight: 700 }}>{d.km} km</div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>TSS {d.tss}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: "var(--space-4)", display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <Text as="div" variant="eyebrow">{c.metric}</Text>
          <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>{c.note}</span>
        </div>
      </Card>
    </div>
  );
}
