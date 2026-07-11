/**
 * 통합 부하 기여 카드 (설계 문서 §3.7) — 이 플랫폼 고유의 순간.
 *
 * "이번 러닝이 통합 체력의 42%를 만들고 있어요." 가민(기기 종속 단일 뷰)·런나(러닝 전용)·
 * 스트라바(부하 해석 없음) 어디에도 없는 프레이밍이다.
 *
 * 종목이 하나뿐이면 렌더하지 않는다 — 자전거를 타지 않는 러너에게 "통합"은 의미가 없다.
 */
import { useTranslation } from "react-i18next";
import { Card, Text } from "../../theme/components";
import { LocalizedLink } from "../LocalizedLink";
import {
  computeContribution,
  sliceFor,
  type ContribDiscipline,
} from "../../utils/crossDisciplineContribution";
import type { UserFitness } from "@shared/types";

export interface CrossDisciplineLoadCardProps {
  fitness: UserFitness | null;
  /** 현재 보고 있는 종목 — 이 종목의 기여도를 문장으로 말해준다. */
  discipline: ContribDiscipline;
}

/** 종목색 — OriderThemeProvider 가 주입하는 `--color-brand-*` (defaultTheme.brandBike/Run/Swim). */
const COLOR: Record<ContribDiscipline, string> = {
  bike: "var(--color-brand-bike)",
  run: "var(--color-brand-run)",
  swim: "var(--color-brand-swim)",
};

export default function CrossDisciplineLoadCard({ fitness, discipline }: CrossDisciplineLoadCardProps) {
  const { t } = useTranslation("fitness");
  const contribution = computeContribution(fitness);

  // 서버 문서가 없거나(신규 사용자) 단일 종목이면 이 카드는 할 말이 없다.
  if (!contribution || !contribution.isMultiDiscipline) return null;

  const mine = sliceFor(contribution, discipline);

  return (
    <Card>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>
        {t("crossLoad.eyebrow")}
      </Text>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <Donut contribution={contribution} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <Text as="p" variant="body" tone="primary" style={{ margin: 0, lineHeight: 1.5 }}>
            {t("crossLoad.headline", {
              sport: t(`discipline.${discipline}`),
              pct: mine.pct,
            })}
          </Text>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            {contribution.slices
              .filter((s) => s.ctl > 0)
              .map((s) => (
                <span key={s.discipline} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: "var(--r-sm)", background: COLOR[s.discipline] }}
                  />
                  <Text as="span" variant="caption" tone="tertiary">
                    {t(`discipline.${s.discipline}`)} {s.pct}%
                  </Text>
                </span>
              ))}
          </div>
        </div>
      </div>

      <LocalizedLink
        to="/fitness?sport=tri"
        style={{
          display: "inline-block",
          marginTop: "var(--space-3)",
          color: "var(--accent)",
          fontSize: "var(--fs-xs)",
          fontWeight: 600,
        }}
      >
        {t("crossLoad.viewTri")} →
      </LocalizedLink>
    </Card>
  );
}

/** 미니 도넛 — TriFitnessView 의 ContribDonut(180px, 범례 포함)의 대시보드용 축약형. */
function Donut({ contribution }: { contribution: NonNullable<ReturnType<typeof computeContribution>> }) {
  const { t } = useTranslation("fitness");
  const size = 64;
  const cx = size / 2;
  const cy = size / 2;
  const outer = 30;
  const inner = 21;

  let acc = 0;
  const arcs = contribution.slices
    .filter((s) => s.pct > 0)
    .map((s) => {
      const a0 = (acc / 100) * Math.PI * 2 - Math.PI / 2;
      acc += s.pct;
      const a1 = (acc / 100) * Math.PI * 2 - Math.PI / 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
      const [x0, y0] = p(outer, a0);
      const [x1, y1] = p(outer, a1);
      const [xi1, yi1] = p(inner, a1);
      const [xi0, yi0] = p(inner, a0);
      return {
        key: s.discipline,
        color: COLOR[s.discipline],
        d: `M${x0} ${y0} A${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L${xi1} ${yi1} A${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0} Z`,
      };
    });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0 }}
      role="img"
      aria-label={t("crossLoad.donutA11y", { ctl: contribution.totalCtl })}
    >
      {arcs.map((a) => (
        <path key={a.key} d={a.d} fill={a.color} />
      ))}
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="var(--ink-0)"
        fontFamily="var(--font-mono)"
      >
        {Math.round(contribution.totalCtl)}
      </text>
    </svg>
  );
}
