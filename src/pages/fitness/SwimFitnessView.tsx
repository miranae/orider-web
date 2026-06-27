/**
 * 수영 피트니스 뷰 (데모/프리뷰 모드)
 * 실제 서비스에서는 FitnessPage.tsx의 실데이터 경로가 렌더링됨.
 * 이 컴포넌트는 데이터 없는 신규 유저나 디자인 참조용으로 유지.
 */
import { useTranslation } from "react-i18next";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import { Card, Text } from "../../theme/components";

// ─────────────────────────────────────────────────────────────────────────────
// Mock 데이터 (프로토타입 동일)
// ─────────────────────────────────────────────────────────────────────────────
const PAST = 90;
const FUTURE = 91;
const TOTAL = PAST + FUTURE;

function buildSwimData() {
  const ctl = Array.from({ length: TOTAL }, (_, i) => {
    if (i < PAST) return i < 30 ? 4 + (i / 30) * 5 : 9 + ((i - 30) / 60) * 11;
    const p = i - PAST;
    if (p < 42) return 20 + (p / 42) * 7;
    if (p < 63) return 27 + ((p - 42) / 21) * 1;
    return 28 - ((p - 63) / (FUTURE - 63)) * 3;
  });
  const atl = ctl.map((v, i) => {
    if (i < PAST) return v + 3 + Math.sin(i * 0.3) * 4;
    const p = i - PAST;
    if (p < 42) return v + 5 + Math.sin(p * 0.3) * 3;
    if (p < 63) return v + 2;
    return v - 4;
  });
  const tsb = ctl.map((c, i) => c - atl[i]!);
  return { ctl, atl, tsb };
}

const swimData = buildSwimData();

// ─────────────────────────────────────────────────────────────────────────────
// SwimPMC SVG 차트
// ─────────────────────────────────────────────────────────────────────────────
function SwimPMC() {
  const { t } = useTranslation("fitness");
  const { ctl, atl, tsb } = swimData;
  const w = 1080, h = 280;
  const max = 42, min = -12;

  const sx = (i: number) => (i / (TOTAL - 1)) * w;
  const sy = (v: number) => h - ((v - min) / (max - min)) * h;

  const seg = (arr: number[], from: number, to: number) =>
    arr
      .slice(from, to)
      .map((v, i) => `${i ? "L" : "M"}${sx(from + i)} ${sy(v)}`)
      .join(" ");

  const todayX = sx(PAST - 1);
  const goalX = sx(TOTAL - 1);

  const ctlFillPath =
    `M0 ${h} ` +
    seg(ctl, 0, PAST).replace(/^M/, "L") +
    ` L${todayX} ${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height: 280 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="swimFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--aqua)" stopOpacity="0.30" />
          <stop offset="1" stopColor="var(--aqua)" stopOpacity="0" />
        </linearGradient>
        <pattern
          id="hatchSwim"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke="rgba(120,200,220,0.12)"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      {/* 미래 hatch */}
      <rect
        x={todayX}
        y="0"
        width={w - todayX}
        height={h}
        fill="url(#hatchSwim)"
      />

      {/* 가이드 라인 */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1="0"
          x2={w}
          y1={h * p}
          y2={h * p}
          stroke="var(--grid-soft)"
        />
      ))}
      <line
        x1="0"
        x2={w}
        y1={sy(0)}
        y2={sy(0)}
        stroke="var(--grid-axis)"
        strokeDasharray="3 3"
      />

      {/* CTL gradient fill */}
      <path d={ctlFillPath} fill="url(#swimFill)" />

      {/* CTL 라인 */}
      <path
        d={seg(ctl, 0, PAST)}
        stroke="var(--aqua)"
        strokeWidth="2.2"
        fill="none"
      />
      <path
        d={seg(ctl, PAST - 1, TOTAL)}
        stroke="var(--aqua)"
        strokeWidth="2"
        fill="none"
        strokeDasharray="4 3"
        opacity="0.85"
      />

      {/* ATL */}
      <path
        d={seg(atl, 0, PAST)}
        stroke="var(--rose)"
        strokeWidth="1.5"
        fill="none"
        opacity="0.7"
      />
      <path
        d={seg(atl, PAST - 1, TOTAL)}
        stroke="var(--rose)"
        strokeWidth="1.3"
        fill="none"
        strokeDasharray="3 3"
        opacity="0.5"
      />

      {/* TSB */}
      <path
        d={seg(tsb, 0, PAST)}
        stroke="var(--amber)"
        strokeWidth="1.5"
        fill="none"
        opacity="0.7"
      />
      <path
        d={seg(tsb, PAST - 1, TOTAL)}
        stroke="var(--amber)"
        strokeWidth="1.3"
        fill="none"
        strokeDasharray="3 3"
        opacity="0.6"
      />

      {/* 오늘 마커 */}
      <line
        x1={todayX}
        x2={todayX}
        y1="0"
        y2={h}
        stroke="var(--ink-2)"
        strokeDasharray="2 2"
        opacity="0.5"
      />
      <text
        x={todayX + 6}
        y="14"
        fontSize="10"
        fontFamily="JetBrains Mono"
        fill="var(--ink-2)"
      >
        {t("swimView.today")}
      </text>
      <circle
        cx={todayX}
        cy={sy(ctl[PAST - 1]!)}
        r="4"
        fill="var(--aqua)"
        stroke="#041820"
        strokeWidth="2"
      />

      {/* 목표일 마커 */}
      <line
        x1={goalX}
        x2={goalX}
        y1="0"
        y2={h}
        stroke="var(--aqua)"
        strokeWidth="1.5"
        opacity="0.85"
      />
      <rect x={goalX - 70} y="4" width="68" height="18" rx="3" fill="var(--aqua)" />
      <text
        x={goalX - 36}
        y="16"
        fontSize="10"
        fontFamily="JetBrains Mono"
        fill="#041820"
        fontWeight="700"
        textAnchor="middle"
      >
        {t("swimView.goalMarker")}
      </text>
      <circle
        cx={goalX}
        cy={sy(ctl[TOTAL - 1]!)}
        r="5"
        fill="var(--aqua)"
        stroke="#041820"
        strokeWidth="2"
      />
      <text
        x={goalX - 8}
        y={sy(ctl[TOTAL - 1]!) - 8}
        fontSize="11"
        fontFamily="JetBrains Mono"
        fill="var(--aqua)"
        fontWeight="600"
        textAnchor="end"
      >
        CTL {ctl[TOTAL - 1]!.toFixed(0)}
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SwimFitnessView
// ─────────────────────────────────────────────────────────────────────────────
export default function SwimFitnessView() {
  const { t } = useTranslation("fitness");
  const { ctl, tsb } = swimData;

  const KPI_ITEMS = [
    {
      labelKey: "swimView.kpi.ctl.label",
      value: "20.0",
      unit: undefined as string | undefined,
      sub: t("swimView.kpi.ctl.sub"),
      desc: t("swimView.kpi.ctl.desc"),
      color: "var(--aqua)",
    },
    {
      labelKey: "kpi.atl.label",
      value: "21.4",
      unit: undefined as string | undefined,
      sub: t("swimView.kpi.atl.sub"),
      desc: t("kpi.atl.descNormal"),
      color: "var(--rose)",
    },
    {
      labelKey: "kpi.tsb.label",
      value: "−1.4",
      unit: undefined as string | undefined,
      sub: t("swimView.kpi.tsb.sub"),
      desc: t("swimView.kpi.tsb.desc"),
      color: "var(--amber)",
    },
    {
      labelKey: "swimView.kpi.css.label",
      value: "1:48",
      unit: "/100m",
      sub: t("swimView.kpi.css.sub"),
      desc: t("swimView.kpi.css.desc"),
      color: "var(--aqua)",
    },
  ] as const;

  const SWIM_ZONES = [
    { z: "Z1", nameKey: "swimView.zone.z1", pct: 22, dist: "2.5 km", color: "oklch(0.70 0.10 220)", pace: "> 2:15/100m" },
    { z: "Z2", nameKey: "swimView.zone.z2", pct: 38, dist: "4.3 km", color: "oklch(0.75 0.11 200)", pace: "2:00 – 2:15" },
    { z: "Z3", nameKey: "zone.endurance",   pct: 18, dist: "2.0 km", color: "oklch(0.78 0.12 180)", pace: "1:52 – 2:00" },
    { z: "Z4", nameKey: "swimView.zone.z4", pct: 16, dist: "1.8 km", color: "oklch(0.80 0.14 160)", pace: "1:45 – 1:52" },
    { z: "Z5", nameKey: "swimView.zone.z5", pct: 6,  dist: "0.6 km", color: "oklch(0.78 0.15 120)", pace: "< 1:38" },
  ] as const;

  const WEEKLY_STATS = [
    { labelKey: "swimView.weekly.tss",   value: "118", unit: "sTSS" },
    { labelKey: "swimView.weekly.dist",  value: "4.8", unit: "km" },
    { labelKey: "swimView.weekly.sessions", value: "3", unit: t("swimView.weekly.sessionsUnit") },
    { labelKey: "swimView.weekly.swolf", value: "34",  unit: "" },
  ] as const;

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 24px 48px" }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 'var(--space-6)', paddingTop: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 'var(--space-3)',
            marginBottom: 6,
          }}
        >
          <Text as="div" variant="eyebrow">{t("swimView.header.eyebrow")}</Text>
          <DisciplineTabs includeTri />
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--ink-0)",
            margin: 0,
          }}
        >
          {t("swimView.header.title")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6 }}>
          {t("swimView.header.subtitle")}
        </p>
      </div>

      {/* KPI 4칸 */}
      <Card padding="none"
        style={{
          padding: 0,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
        }}
      >
        {KPI_ITEMS.map((s, i) => (
          <div
            key={s.labelKey}
            style={{
              padding: "22px 24px",
              borderRight: i < 3 ? "1px solid var(--line-soft)" : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: s.color,
                }}
              />
              <Text variant="eyebrow">{t(s.labelKey)}</Text>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 'var(--space-1)',
                marginBottom: 'var(--space-2)',
              }}
            >
              <Text variant="dataHero"
                style={{
                  fontSize: 40,
                  color: s.color,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {s.value}
              </Text>
              {s.unit && <Text variant="unit">{s.unit}</Text>}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 'var(--space-2)',
                fontSize: 11,
                color: "var(--ink-3)",
              }}
            >
              <Text variant="mono">{s.sub}</Text>
              <span style={{ color: "var(--ink-4)" }}>·</span>
              <span>{s.desc}</span>
            </div>
          </div>
        ))}
      </Card>

      {/* SwimPMC */}
      <Card padding="none" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            marginBottom: 14,
          }}
        >
          <div>
            <h3 style={{ margin: 0, marginBottom: 3, fontSize: 14, fontWeight: 600, color: "var(--ink-0)" }}>
              {t("swimView.pmc.title")}
            </h3>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {t("swimView.pmc.sub")}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {/* 범례 */}
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 11,
              color: "var(--ink-3)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 14,
                  height: 8,
                  background: "var(--aqua)",
                  opacity: 0.45,
                  borderRadius: 2,
                }}
              />
              {t("pmc.legend.ctl")}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{ width: 14, height: 2, background: "var(--rose)" }}
              />
              {t("pmc.legend.atl")}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{ width: 14, height: 2, background: "var(--amber)" }}
              />
              {t("pmc.legend.tsb")}
            </span>
          </div>
        </div>

        <SwimPMC />

        {/* 날짜 축 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 'var(--space-2)',
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--ink-4)",
          }}
        >
          <span>{t("swimView.dateAxis.start")}</span>
          <span>{t("swimView.dateAxis.mid1")}</span>
          <span style={{ color: "var(--aqua)" }}>{t("swimView.dateAxis.today")}</span>
          <span>{t("swimView.dateAxis.mid2")}</span>
          <span style={{ color: "var(--aqua)" }}>{t("swimView.dateAxis.goal")}</span>
        </div>

        {/* 목표 배너 */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            padding: 14,
            background:
              "color-mix(in oklch, var(--aqua) 5%, var(--bg-2))",
            border:
              "1px solid color-mix(in oklch, var(--aqua) 22%, var(--line-soft))",
            borderRadius: 6,
            display: "grid",
            gridTemplateColumns: "2fr repeat(3, 1fr)",
            gap: 'var(--space-5)',
            alignItems: "center",
          }}
        >
          <div>
            <Text as="div" variant="eyebrow"
              style={{ color: "var(--aqua)", marginBottom: 'var(--space-1)' }}
            >
              {t("swimView.goal.eyebrow")}
            </Text>
            <div
              style={{ fontSize: 13, color: "var(--ink-0)", fontWeight: 500 }}
            >
              2026-07-12 · D-
              <Text variant="mono" style={{ color: "var(--aqua)" }}>
                74
              </Text>
              <span
                style={{
                  color: "var(--ink-3)",
                  fontSize: 11,
                  marginLeft: 10,
                }}
              >
                {t("swimView.goal.detail")}
              </span>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>
              {t("goal.ctl")}
            </Text>
            <div>
              <Text variant="dataMedium"
                style={{
                  color: "var(--aqua)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {ctl[TOTAL - 1]!.toFixed(0)}
              </Text>
              <Text variant="unit"> +8</Text>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>
              {t("swimView.goal.cssLabel")}
            </Text>
            <div>
              <Text variant="dataMedium"
                style={{
                  color: "var(--aqua)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                1:45
              </Text>
              <Text variant="unit"> /100m</Text>
            </div>
          </div>
          <div>
            <Text as="div" variant="eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>
              {t("goal.adherence")}
            </Text>
            <div>
              <Text variant="dataMedium"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                85
              </Text>
              <Text variant="unit"> %</Text>
            </div>
          </div>
        </div>
      </Card>

      {/* 수영 존 분포 */}
      <Card padding="none" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ margin: 0, marginBottom: 3, fontSize: 14, fontWeight: 600, color: "var(--ink-0)" }}>
            {t("swimView.zoneDist.title")}
          </h3>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {t("swimView.zoneDist.sub")}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-3)' }}>
          {SWIM_ZONES.map((zone) => (
            <div
              key={zone.z}
              style={{ display: "flex", alignItems: "center", gap: 14 }}
            >
              <div
                style={{
                  width: 90,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    color: zone.color,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  {zone.z}
                </span>
                <span style={{ fontSize: 12 }}>{t(zone.nameKey)}</span>
              </div>
              <div
                style={{
                  width: 100,
                  fontSize: 10,
                  color: "var(--ink-4)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {zone.pace}
              </div>
              <div
                style={{
                  flex: 1,
                  height: 18,
                  background: "var(--bg-2)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${zone.pct * 2.2}%`,
                    height: "100%",
                    background: zone.color,
                  }}
                />
              </div>
              <div
                style={{
                  width: 40,
                  textAlign: "right",
                  fontSize: 12,
                  color: "var(--ink-1)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {zone.pct}%
              </div>
              <div
                style={{
                  width: 56,
                  textAlign: "right",
                  fontSize: 11,
                  color: "var(--ink-3)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {zone.dist}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 14,
            paddingTop: 'var(--space-3)',
            borderTop: "1px solid var(--line-soft)",
            fontSize: 11,
            color: "var(--ink-3)",
            display: "flex",
            gap: 'var(--space-4)',
          }}
        >
          <span>
            {t("swimView.zoneDist.lowIntensity")}{" "}
            <span
              style={{
                color: "oklch(0.75 0.11 200)",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
              }}
            >
              60%
            </span>
          </span>
          <span>
            CSS+{" "}
            <span
              style={{
                color: "var(--aqua)",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
              }}
            >
              22%
            </span>
          </span>
          <span style={{ color: "var(--lime)" }}>{t("swimView.zoneDist.ideal")}</span>
        </div>
      </Card>

      {/* 주간 통계 요약 */}
      <Card padding="none" style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <h3 style={{ margin: 0, marginBottom: 'var(--space-4)', fontSize: 14, fontWeight: 600, color: "var(--ink-0)" }}>
          {t("swimView.weekly.title")}
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
          }}
        >
          {WEEKLY_STATS.map((item) => (
            <div key={item.labelKey}>
              <Text as="div" variant="eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>
                {t(item.labelKey)}
              </Text>
              <div>
                <Text variant="dataMedium"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {item.value}
                </Text>
                {item.unit && (
                  <Text variant="unit"> {item.unit}</Text>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* 현재 TSB 상태 메모 */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            paddingTop: 14,
            borderTop: "1px solid var(--line-soft)",
            fontSize: 11,
            color: "var(--ink-3)",
            lineHeight: 1.6,
          }}
        >
          {t("swimView.weekly.tsbNote", { tsb: tsb[PAST - 1]!.toFixed(1) })}
        </div>
      </Card>
    </div>
  );
}
