/**
 * 러닝 피트니스 뷰 (데모/프리뷰 모드)
 * 실제 서비스에서는 FitnessPage.tsx의 실데이터 경로가 렌더링됨.
 * 이 컴포넌트는 데이터 없는 신규 유저나 디자인 참조용으로 유지.
 */
import { useTranslation } from "react-i18next";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import { Card, Text } from "../../theme/components";

// ── 러닝 PMC 차트 ───────────────────────────────────────────────
function RunPMC() {
  const { t } = useTranslation("fitness");
  const past = 90, future = 91, total = past + future;

  const ctl: number[] = Array.from({ length: total }, (_, i) => {
    if (i < past) return 22 + (i / past) * 18 + Math.sin(i * 0.1) * 2;
    const p = i - past;
    if (p < 42) return 40 + (p / 42) * 18;
    if (p < 63) return 58 + ((p - 42) / 21) * 4;
    return 62 - ((p - 63) / (future - 63)) * 6;
  });

  const atl: number[] = ctl.map((v, i) => {
    if (i < past) return v + 3 + Math.sin(i * 0.3) * 9;
    const p = i - past;
    if (p < 42) return v + 8 + Math.sin(p * 0.3) * 5;
    if (p < 63) return v + 4;
    return v - 14;
  });

  const tsb: number[] = ctl.map((v, i) => v - atl[i]!);

  const w = 1080, h = 280;
  const max = 80, min = -22;
  const sx = (i: number) => (i / (total - 1)) * w;
  const sy = (v: number) => h - ((v - min) / (max - min)) * h;
  const linePath = (arr: number[], from: number, to: number) =>
    arr.slice(from, to).map((v, i) => `${i ? "L" : "M"}${sx(from + i)} ${sy(v)}`).join(" ");

  const pastCtlArea = `M0 ${sy(0)} ${ctl.slice(0, past).map((v, i) => `L${sx(i)} ${sy(v)}`).join(" ")} L${sx(past - 1)} ${sy(0)} Z`;
  const todayX = sx(past - 1);
  const goalX = sx(total - 1);
  const goalCTL = ctl[total - 1]!;
  const goalTSB = tsb[total - 1]!;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 280 }} preserveAspectRatio="none">
      <defs>
        <pattern id="projHatchRun" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="rgba(255,180,80,0.03)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,180,80,0.12)" strokeWidth="1" />
        </pattern>
      </defs>

      {/* 예측 구간 해치 */}
      <rect x={todayX} y="0" width={w - todayX} height={h} fill="url(#projHatchRun)" />

      {/* 격자 */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line key={p} x1="0" x2={w} y1={h * p} y2={h * p} stroke="var(--grid-soft)" />
      ))}
      <line x1="0" x2={w} y1={sy(0)} y2={sy(0)} stroke="var(--grid-axis)" strokeDasharray="3 3" />

      {/* CTL gradient fill */}
      <path d={pastCtlArea} fill="var(--amber)" opacity="0.18" />

      {/* CTL 라인 */}
      <path d={linePath(ctl, 0, past)} stroke="var(--amber)" strokeWidth="2.2" fill="none" />
      <path d={linePath(ctl, past - 1, total)} stroke="var(--amber)" strokeWidth="2" fill="none" strokeDasharray="4 3" opacity="0.85" />

      {/* ATL 라인 */}
      <path d={linePath(atl, 0, past)} stroke="var(--rose)" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d={linePath(atl, past - 1, total)} stroke="var(--rose)" strokeWidth="1.3" fill="none" strokeDasharray="3 3" opacity="0.5" />

      {/* TSB 라인 */}
      <path d={linePath(tsb, 0, past)} stroke="var(--lime)" strokeWidth="1.5" fill="none" opacity="0.75" />
      <path d={linePath(tsb, past - 1, total)} stroke="var(--lime)" strokeWidth="1.3" fill="none" strokeDasharray="3 3" opacity="0.65" />

      {/* 오늘 마커 */}
      <line x1={todayX} x2={todayX} y1="0" y2={h} stroke="var(--ink-2)" strokeDasharray="2 2" opacity="0.5" />
      <text x={todayX + 6} y="14" fontSize="10" fontFamily="JetBrains Mono" fill="var(--ink-2)">{t("runView.today")}</text>
      <circle cx={todayX} cy={sy(ctl[past - 1]!)} r="4" fill="var(--amber)" stroke="#1a0f00" strokeWidth="2" />

      {/* 목표일 마커 */}
      <line x1={goalX} x2={goalX} y1="0" y2={h} stroke="var(--amber)" strokeWidth="1.5" opacity="0.8" />
      <rect x={goalX - 72} y="4" width="70" height="18" rx="3" fill="var(--amber)" />
      <text x={goalX - 37} y="16" fontSize="10" fontFamily="JetBrains Mono" fill="#1a0f00" fontWeight="700" textAnchor="middle">하프 · 7/18</text>
      <circle cx={goalX} cy={sy(goalCTL)} r="5" fill="var(--amber)" stroke="#1a0f00" strokeWidth="2" />
      <text x={goalX - 8} y={sy(goalCTL) - 8} fontSize="11" fontFamily="JetBrains Mono" fill="var(--amber)" fontWeight="600" textAnchor="end">CTL {goalCTL.toFixed(0)}</text>
      <text x={goalX - 8} y={sy(goalTSB) - 6} fontSize="10" fontFamily="JetBrains Mono" fill="var(--lime)" textAnchor="end">TSB +{goalTSB.toFixed(0)}</text>
    </svg>
  );
}

// ── KPI 데이터 ──────────────────────────────────────────────────
interface KpiDef {
  labelKey: string;
  value: string;
  color: string;
  sub: string;       // 데이터 문자열 또는 번역 키
  subIsKey?: true;   // sub이 번역 키이면 true
  descKey: string;
  unit?: string;
}

const KPI_DEFS: KpiDef[] = [
  { labelKey: "runView.kpi.runCtl.label",        value: "42.8", color: "var(--amber)", sub: "+16.2 / 90일", descKey: "runView.kpi.runCtl.desc" },
  { labelKey: "kpi.atl.label",                   value: "46.3", color: "var(--rose)",  sub: "+4.1 / 7일",   descKey: "kpi.atl.descNormal" },
  { labelKey: "kpi.tsb.label",                   value: "−3.5", color: "var(--lime)",  sub: "runView.kpi.tsb.subAdapt", subIsKey: true, descKey: "runView.kpi.tsb.desc" },
  { labelKey: "runView.kpi.thresholdPace.label", value: "4:35", color: "var(--amber)", sub: "−0:08 / 60일", descKey: "runView.kpi.thresholdPace.desc", unit: "/km" },
];

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function RunFitnessView() {
  const { t } = useTranslation("fitness");

  const KPI_ITEMS = KPI_DEFS.map((d) => ({
    label: t(d.labelKey),
    value: d.value,
    color: d.color,
    sub: d.subIsKey ? t(d.sub) : d.sub,
    desc: t(d.descKey),
    unit: d.unit,
  }));

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px 48px" }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 'var(--space-6)', paddingTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', marginBottom: 6 }}>
          <Text as="div" variant="eyebrow">{t("runView.header.eyebrow")}</Text>
          <DisciplineTabs includeTri />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-0)", margin: 0 }}>
          {t("runView.header.title")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6 }}>
          {t("runView.header.subtitle")}
        </p>
      </div>

      {/* KPI 4칸 */}
      <Card padding="none"
        style={{ padding: 0, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {KPI_ITEMS.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "22px 24px",
              borderRight: i < 3 ? "1px solid var(--line-soft)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <Text variant="eyebrow">{s.label}</Text>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
              <Text variant="dataHero" style={{ color: s.color }}>{s.value}</Text>
              {s.unit && <Text variant="unit">{s.unit}</Text>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', fontSize: 11, color: "var(--ink-3)" }}>
              <Text variant="mono">{s.sub}</Text>
              <span style={{ color: "var(--ink-4)" }}>·</span>
              <span>{s.desc}</span>
            </div>
          </div>
        ))}
      </Card>

      {/* PMC 카드 */}
      <Card padding="none" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: 3, fontSize: 14, fontWeight: 600, color: "var(--ink-0)" }}>
              {t("runView.pmc.title")}
            </h3>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("runView.pmc.sub")}</div>
          </div>
          <div style={{ flex: 1 }} />
          {/* 범례 */}
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--ink-3)", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 2, background: "var(--amber)", flexShrink: 0 }} />
              CTL
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 2, background: "var(--rose)", flexShrink: 0 }} />
              ATL
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 2, background: "var(--lime)", flexShrink: 0 }} />
              TSB
            </span>
          </div>
        </div>

        <RunPMC />

        {/* 날짜 레이블 */}
        <div
          style={{
            display: "flex", justifyContent: "space-between",
            marginTop: 'var(--space-2)', fontSize: 10,
            fontFamily: "var(--font-mono)", color: "var(--ink-4)",
          }}
        >
          <span>1월 29</span>
          <span>3월 15</span>
          <span style={{ color: "var(--lime)" }}>{t("runView.todayDate", { date: "4월 29" })}</span>
          <span>6월 10</span>
          <span style={{ color: "var(--lime)" }}>{t("runView.goalDate", { date: "7월 18", event: "하프마라톤" })}</span>
        </div>

        {/* 목표 배너 */}
        <div
          style={{
            marginTop: 'var(--space-4)', padding: 14,
            background: "color-mix(in oklch, var(--lime) 5%, var(--bg-2))",
            border: "1px solid color-mix(in oklch, var(--lime) 20%, var(--line-soft))",
            borderRadius: 6,
            display: "grid",
            gridTemplateColumns: "2fr repeat(3, 1fr)",
            gap: 'var(--space-5)',
            alignItems: "center",
          }}
        >
          <div>
            <Text as="div" variant="eyebrow" style={{ color: "var(--lime)", marginBottom: 'var(--space-1)' }}>
              {t("runView.goal.eyebrow")}
            </Text>
            <div style={{ fontSize: 13, color: "var(--ink-0)", fontWeight: 500 }}>
              2026-07-18 · D-<Text variant="mono" style={{ color: "var(--lime)" }}>80</Text>
              <span style={{ color: "var(--ink-3)", fontSize: 11, marginLeft: 10 }}>{t("runView.goal.distancePace")}</span>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>{t("runView.goal.runCtlLabel")}</Text>
            <div>
              <Text variant="dataLarge" style={{ color: "var(--amber)" }}>62</Text>
              <Text variant="unit">+20</Text>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>{t("goal.tsb")}</Text>
            <div>
              <Text variant="dataLarge" style={{ color: "var(--amber)" }}>+12</Text>
              <Text variant="unit">{t("goal.tsbStatus.optimal")}</Text>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>{t("goal.adherence")}</Text>
            <div>
              <Text variant="dataLarge">91</Text>
              <Text variant="unit">%</Text>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
