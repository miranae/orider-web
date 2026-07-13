import { LocalizedLink as Link } from "../LocalizedLink";
import { Card, Text, buttonClass } from "../../theme/components";

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
  { label: "Mon", titleKo: "회복", titleEn: "Recovery", tss: 22 },
  { label: "Tue", titleKo: "템포", titleEn: "Tempo", tss: 68 },
  { label: "Thu", titleKo: "인터벌", titleEn: "Intervals", tss: 92 },
  { label: "Sat", titleKo: "롱라이드", titleEn: "Long ride", tss: 118 },
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
  const ko = (lang ?? "ko").startsWith("ko");
  const shared = {
    badge: ko ? "데모 데이터" : "Demo data",
    cta: ko ? "로그인하면 내 데이터로 보기" : "Sign in to use my data",
    tools: ko ? "비로그인 계산기 열기" : "Open public calculator",
    note: ko
      ? "로그인하면 같은 화면이 내 활동, 목표, 훈련 기록 기반으로 바뀝니다."
      : "After sign-in, this same surface switches to your activities, goals, and training log.",
  };
  if (kind === "fitness") {
    return {
      ...shared,
      title: ko ? "피트니스 곡선 미리보기" : "Fitness curve preview",
      desc: ko ? "CTL, ATL, TSB 흐름으로 훈련 부하와 회복 타이밍을 먼저 확인합니다." : "Preview load, fatigue, and form with CTL, ATL, and TSB.",
      metric: ko ? "오늘 컨디션" : "Today form",
    };
  }
  if (kind === "plan") {
    return {
      ...shared,
      title: ko ? "주간 플랜 미리보기" : "Weekly plan preview",
      desc: ko ? "목표일까지 남은 기간에 맞춰 강도와 회복일이 어떻게 배치되는지 보여줍니다." : "See how workload and recovery days are placed before a goal.",
      metric: ko ? "이번 주 목표" : "Week target",
    };
  }
  return {
    ...shared,
    title: ko ? "훈련일지 미리보기" : "Training log preview",
    desc: ko ? "월간 거리, TSS, 주요 운동을 한 화면에서 확인하는 방식을 보여줍니다." : "Preview monthly distance, TSS, and key sessions in one view.",
    metric: ko ? "월간 기록" : "Monthly log",
  };
}

export default function GuestValuePreview({ kind, lang }: GuestValuePreviewProps) {
  const c = copy(kind, lang);
  const isFitness = kind === "fitness";
  const isPlan = kind === "plan";

  return (
    <div className="site-shell" style={{ padding: "48px 20px 64px" }}>
      <Card padding="none" style={{ padding: "var(--space-6)", display: "grid", gap: "var(--space-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ maxWidth: 640 }}>
            <Text as="div" variant="eyebrow" style={{ color: "var(--lime)", marginBottom: "var(--space-2)" }}>{c.badge}</Text>
            <Text as="h1" variant="pageTitle" style={{ margin: 0 }}>{c.title}</Text>
            <p style={{ marginTop: "var(--space-2)", color: "var(--ink-3)", fontSize: "var(--fs-sm)", lineHeight: 1.7 }}>{c.desc}</p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <Link to="/settings?section=connections" className={buttonClass({ variant: "primary", size: "sm" })}>{c.cta}</Link>
            <Link to="/tools/virtual-power" className={buttonClass({ variant: "secondary", size: "sm" })}>{c.tools}</Link>
          </div>
        </div>

        {isFitness ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: "var(--space-3)" }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px, 1fr))", gap: "var(--space-3)" }}>
            {PLAN_DAYS.map((d) => (
              <div key={d.label} style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: "var(--space-4)", background: "var(--bg-2)" }}>
                <Text as="div" variant="eyebrow">{d.label}</Text>
                <div style={{ marginTop: "var(--space-2)", fontWeight: 700, color: "var(--ink-0)" }}>{(lang ?? "ko").startsWith("ko") ? d.titleKo : d.titleEn}</div>
                <Text variant="dataMedium" style={{ color: "var(--amber)" }}>{d.tss}</Text>
                <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginLeft: "var(--space-1)" }}>TSS</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(80px, 1fr))", gap: "var(--space-2)" }}>
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
