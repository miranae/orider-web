/**
 * 바이크 피트니스 뷰 (데모/프리뷰 모드)
 * 실제 서비스에서는 FitnessPage.tsx의 실데이터 경로가 렌더링됨.
 * 이 컴포넌트는 데이터 없는 신규 유저나 디자인 참조용으로 유지.
 */
import { useTranslation } from "react-i18next";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import { Card, Text } from "../../theme/components";

const BIKE = "oklch(0.82 0.13 195)";

// ── 바이크 PMC 차트 ──────────────────────────────────────────────
function BikePMC() {
  const { t } = useTranslation("fitness");
  const past = 90, future = 91, total = past + future;

  const ctl: number[] = Array.from({ length: total }, (_, i) => {
    if (i < past) return 52 + (i / past) * 12 + Math.sin(i * 0.08) * 3;
    const p = i - past;
    if (p < 42) return 64 + (p / 42) * 10;
    if (p < 63) return 74 + ((p - 42) / 21) * 2;
    return 76 - ((p - 63) / (future - 63)) * 4;
  });

  const atl: number[] = ctl.map((v, i) => {
    if (i < past) return v + 4 + Math.sin(i * 0.3) * 7 + Math.sin(i * 0.5) * 3;
    const p = i - past;
    if (p < 42) return v + 8 + Math.sin(p * 0.3) * 5;
    if (p < 63) return v + 3 + Math.sin(p * 0.3) * 4;
    return v - 10 + ((p - 63) / (future - 63)) * 3;
  });

  const tsb: number[] = ctl.map((c, i) => c - atl[i]!);

  const w = 1080, h = 280;
  const max = 100, min = -22;
  const sx = (i: number) => (i / (total - 1)) * w;
  const sy = (v: number) => h - ((v - min) / (max - min)) * h;
  const lineSeg = (arr: number[], from: number, to: number) =>
    arr.slice(from, to).map((v, i) => `${i ? "L" : "M"}${sx(from + i)} ${sy(v)}`).join(" ");

  const todayX = sx(past - 1);
  const goalX = sx(total - 1);
  const goalCTL = ctl[total - 1]!;
  const goalTSB = tsb[total - 1]!;

  const ctlFillPath = `M0 ${h} ${ctl.slice(0, past).map((v, i) => `L${sx(i)} ${sy(v)}`).join(" ")} L${todayX} ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 280 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ctlFillBike" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={BIKE} stopOpacity="0.28" />
          <stop offset="1" stopColor={BIKE} stopOpacity="0" />
        </linearGradient>
        <pattern id="projHatchBike" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(130,200,215,0.12)" strokeWidth="1" />
        </pattern>
      </defs>

      {/* 예측 구간 해치 */}
      <rect x={todayX} y="0" width={w - todayX} height={h} fill="url(#projHatchBike)" />

      {/* 격자 */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line key={p} x1="0" x2={w} y1={h * p} y2={h * p} stroke="var(--grid-soft)" />
      ))}
      <line x1="0" x2={w} y1={sy(0)} y2={sy(0)} stroke="var(--grid-axis)" strokeDasharray="3 3" />

      {/* CTL gradient fill */}
      <path d={ctlFillPath} fill="url(#ctlFillBike)" />

      {/* CTL 라인 */}
      <path d={lineSeg(ctl, 0, past)} stroke={BIKE} strokeWidth="2.2" fill="none" />
      <path d={lineSeg(ctl, past - 1, total)} stroke={BIKE} strokeWidth="2" fill="none" strokeDasharray="4 3" opacity="0.85" />

      {/* ATL 라인 */}
      <path d={lineSeg(atl, 0, past)} stroke="var(--rose)" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d={lineSeg(atl, past - 1, total)} stroke="var(--rose)" strokeWidth="1.3" fill="none" strokeDasharray="3 3" opacity="0.5" />

      {/* TSB 라인 */}
      <path d={lineSeg(tsb, 0, past)} stroke="var(--amber)" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d={lineSeg(tsb, past - 1, total)} stroke="var(--amber)" strokeWidth="1.3" fill="none" strokeDasharray="3 3" opacity="0.6" />

      {/* 오늘 마커 */}
      <line x1={todayX} x2={todayX} y1="0" y2={h} stroke="var(--ink-2)" strokeDasharray="2 2" opacity="0.5" />
      <text x={todayX + 6} y="14" fontSize="10" fontFamily="JetBrains Mono" fill="var(--ink-2)">{t("bikeView.svg.today")}</text>
      <circle cx={todayX} cy={sy(ctl[past - 1]!)} r="4" fill={BIKE} stroke="#041820" strokeWidth="2" />

      {/* 목표일 마커 */}
      <line x1={goalX} x2={goalX} y1="0" y2={h} stroke={BIKE} strokeWidth="1.5" opacity="0.85" />
      <rect x={goalX - 70} y="4" width="68" height="18" rx="3" fill={BIKE} />
      <text x={goalX - 36} y="16" fontSize="10" fontFamily="JetBrains Mono" fill="#041820" fontWeight="700" textAnchor="middle">그란폰도 · 7/5</text>
      <circle cx={goalX} cy={sy(goalCTL)} r="5" fill={BIKE} stroke="#041820" strokeWidth="2" />
      <text x={goalX - 8} y={sy(goalCTL) - 8} fontSize="11" fontFamily="JetBrains Mono" fill={BIKE} fontWeight="600" textAnchor="end">CTL {goalCTL.toFixed(0)}</text>
      <text x={goalX - 8} y={sy(goalTSB) - 6} fontSize="10" fontFamily="JetBrains Mono" fill="var(--amber)" textAnchor="end">TSB +{goalTSB.toFixed(0)}</text>
    </svg>
  );
}

// ── KPI 데이터 ──────────────────────────────────────────────────
interface KpiItem {
  labelKey: string;
  value: string;
  color: string;
  subKey: string;
  descKey: string;
  unit?: string;
}

const KPI_DEFS: KpiItem[] = [
  { labelKey: "bikeView.kpi.bikeCtl.label", value: "64.0", color: BIKE,           subKey: "bikeView.kpi.bikeCtl.sub", descKey: "bikeView.kpi.bikeCtl.desc" },
  { labelKey: "kpi.atl.label",              value: "60.2", color: "var(--rose)",  subKey: "bikeView.kpi.atl.sub",     descKey: "bikeView.kpi.atl.desc" },
  { labelKey: "kpi.tsb.label",              value: "+3.8", color: "var(--amber)", subKey: "bikeView.kpi.tsb.sub",     descKey: "bikeView.kpi.tsb.desc" },
  { labelKey: "FTP",                        value: "290",  color: BIKE,           subKey: "bikeView.kpi.ftp.sub",     descKey: "bikeView.kpi.ftp.desc", unit: "W" },
  { labelKey: "VO2MAX",                     value: "62",   color: "var(--lime)",  subKey: "bikeView.kpi.vo2.sub",     descKey: "bikeView.kpi.vo2.desc", unit: "ml/kg/min" },
];

// ── 메인 컴포넌트 ────────────────────────────────────────────────
export default function BikeFitnessView() {
  const { t } = useTranslation("fitness");

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px 48px" }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 'var(--space-6)', paddingTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-3)', marginBottom: 6 }}>
          <Text as="div" variant="eyebrow">{t("bikeView.header.eyebrow")}</Text>
          <DisciplineTabs includeTri />
        </div>
        <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700, color: "var(--ink-0)", margin: 0 }}>
          {t("bikeView.header.title")}
        </h1>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginTop: 6 }}>
          {t("bikeView.header.subtitle")}
        </p>
      </div>

      {/* KPI 5칸 */}
      <Card padding="none"
        style={{ padding: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}
      >
        {KPI_DEFS.map((s, i) => (
          <div
            key={s.labelKey}
            style={{
              padding: "22px 22px",
              borderRight: i < 4 ? "1px solid var(--line-soft)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <Text variant="eyebrow">{t(s.labelKey)}</Text>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
              <Text variant="dataHero" style={{ color: s.color }}>{s.value}</Text>
              {s.unit && <Text variant="unit">{s.unit}</Text>}
            </div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
              <Text variant="mono">{t(s.subKey)}</Text>
              <span style={{ color: "var(--ink-4)", margin: "0 5px" }}>·</span>
              <span>{t(s.descKey)}</span>
            </div>
          </div>
        ))}
      </Card>

      {/* PMC 카드 */}
      <Card padding="none" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: 3, fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>
              {t("bikeView.pmc.title")}
            </h3>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{t("bikeView.pmc.sub")}</div>
          </div>
          <div style={{ flex: 1 }} />
          {/* 범례 */}
          <div style={{ display: "flex", gap: 14, fontSize: "var(--fs-xs)", color: "var(--ink-3)", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 8, background: BIKE, opacity: 0.45, borderRadius: "var(--r-xs)", flexShrink: 0 }} />
              {t("bikeView.pmc.legend.ctl")}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 2, background: "var(--rose)", flexShrink: 0 }} />
              {t("bikeView.pmc.legend.atl")}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 2, background: "var(--amber)", flexShrink: 0 }} />
              {t("bikeView.pmc.legend.tsb")}
            </span>
          </div>
        </div>

        <BikePMC />

        {/* 날짜 레이블 */}
        <div
          style={{
            display: "flex", justifyContent: "space-between",
            marginTop: 'var(--space-2)', fontSize: "var(--fs-xs)",
            fontFamily: "var(--font-mono)", color: "var(--ink-4)",
          }}
        >
          <span>1월 29</span>
          <span>3월 15</span>
          <span style={{ color: BIKE }}>오늘 · 4월 29</span>
          <span>6월 5</span>
          <span style={{ color: BIKE }}>7월 5 · 그란폰도</span>
        </div>

        {/* 목표 배너 */}
        <div
          style={{
            marginTop: 'var(--space-4)', padding: 14,
            background: `color-mix(in oklch, ${BIKE} 5%, var(--bg-2))`,
            border: `1px solid color-mix(in oklch, ${BIKE} 22%, var(--line-soft))`,
            borderRadius: "var(--r-md)",
            display: "grid",
            gridTemplateColumns: "2fr repeat(3, 1fr)",
            gap: 'var(--space-5)',
            alignItems: "center",
          }}
        >
          <div>
            <Text as="div" variant="eyebrow" style={{ color: BIKE, marginBottom: 'var(--space-1)' }}>
              목표 · 북한강 그란폰도 160km
            </Text>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", fontWeight: 500 }}>
              2026-07-05 · D-<Text variant="mono" style={{ color: BIKE }}>67</Text>
              <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginLeft: 10 }}>160 km · 상승 1,850 m</span>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: 3 }}>{t("goal.ctl")}</Text>
            <div>
              <Text variant="dataLarge" style={{ color: BIKE }}>76</Text>
              <Text variant="unit">+12</Text>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: 3 }}>{t("goal.tsb")}</Text>
            <div>
              <Text variant="dataLarge" style={{ color: "var(--amber)" }}>+12</Text>
              <Text variant="unit">{t("goal.tsbStatus.optimal")}</Text>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: "var(--fs-xs)", marginBottom: 3 }}>{t("goal.adherence")}</Text>
            <div>
              <Text variant="dataLarge">92</Text>
              <Text variant="unit">%</Text>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
