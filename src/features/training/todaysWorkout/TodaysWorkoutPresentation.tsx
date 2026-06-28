import { useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { IntervalBlock } from "@shared/types/goal";

import type { RecommendationFacts, ToneColor } from "../../../utils/todaysRecommendation";
import { Card, Text } from "../../../theme/components";
import { RevalidatingIndicator } from "../../../components/training/RevalidatingIndicator";
import type { FactChip } from "./todaysWorkoutUtils";

const BLOCK_COLOR: Record<IntervalBlock["label"], string> = {
  WU: "var(--ink-3)",
  CD: "var(--ink-3)",
  Z1: "var(--ink-4)",
  Z2: "var(--aqua)",
  Z3: "var(--amber)",
  Z4: "var(--rose)",
  Z5: "var(--rose)",
  R: "var(--bg-3)",
};

const BLOCK_HEIGHT_PCT: Record<IntervalBlock["label"], number> = {
  WU: 40,
  CD: 40,
  Z1: 30,
  Z2: 60,
  Z3: 80,
  Z4: 100,
  Z5: 100,
  R: 30,
};

export function IntervalBar({ intervals }: { intervals: IntervalBlock[] }) {
  const { t } = useTranslation("training");
  const totalMin = intervals.reduce((s, b) => s + b.durationMin, 0) || 1;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hover = hoverIdx != null ? intervals[hoverIdx] : null;
  let anchorPct = 0;
  if (hoverIdx != null) {
    const before = intervals.slice(0, hoverIdx).reduce((s, b) => s + b.durationMin, 0);
    anchorPct = Math.min(Math.max(((before + intervals[hoverIdx]!.durationMin / 2) / totalMin) * 100, 10), 90);
  }
  return (
    <div style={{ position: "relative", margin: "10px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32 }} onPointerLeave={() => setHoverIdx(null)}>
        {intervals.map((block, i) => {
          const widthPct = (block.durationMin / totalMin) * 100;
          const heightPct = BLOCK_HEIGHT_PCT[block.label] ?? 50;
          return (
            <div
              key={i}
              onPointerEnter={() => setHoverIdx(i)}
              style={{
                flex: `0 0 ${widthPct}%`,
                height: `${heightPct}%`,
                background: BLOCK_COLOR[block.label] ?? "var(--bg-3)",
                borderRadius: "var(--r-xs)",
                minWidth: 3,
                opacity: hoverIdx != null && hoverIdx !== i ? 0.5 : 1,
                transition: "opacity 0.12s",
                cursor: "default",
              }}
            />
          );
        })}
      </div>
      {hover && (
        <div
          style={{
            position: "absolute",
            top: -6,
            left: `${anchorPct}%`,
            transform: "translate(-50%, -100%)",
            background: "var(--bg-1)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            padding: "var(--space-2) var(--space-3)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 5,
            fontSize: "var(--fs-xs)",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: "var(--ink-0)",
          }}
        >
          {t("today.intervalTitle", { label: hover.label, minutes: hover.durationMin })}
        </div>
      )}
    </div>
  );
}

export function WeeklyLoadStrip({
  facts,
  accumulated,
  t,
}: {
  facts: RecommendationFacts;
  accumulated: number | null;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (!facts.weeklyTargetTss || !facts.balanceGuide) return null;
  const [lo, hi] = facts.weeklyTargetTss;
  const bg = facts.balanceGuide;
  const phaseTone: ToneColor = bg.phase === "recovery" ? "rose" : bg.phase === "taper" ? "lime" : "amber";
  const remaining = facts.remainingTss;
  return (
    <div
      style={{
        marginTop: "var(--space-3)",
        padding: "var(--space-3)",
        background: `color-mix(in oklch, var(--${phaseTone}) 6%, var(--bg-2))`,
        border: `1px solid color-mix(in oklch, var(--${phaseTone}) 28%, transparent)`,
        borderRadius: "var(--r-md)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
        <Text as="div" variant="eyebrow" style={{ color: `var(--${phaseTone})` }}>
          {t("today.weeklyLoadLabel")}
        </Text>
        <span
          style={{
            padding: "2px 8px",
            background: `color-mix(in oklch, var(--${phaseTone}) 16%, var(--bg-1))`,
            border: `1px solid color-mix(in oklch, var(--${phaseTone}) 40%, transparent)`,
            color: `var(--${phaseTone})`,
            borderRadius: "9999px",
            fontSize: "var(--fs-xs)",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
          }}
        >
          {t(`today.balancePhase.${bg.phase}`)}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-sm)", color: "var(--ink-1)", fontWeight: 600 }}>
        {t("today.weeklyTargetRange", { lo, hi })}
        {accumulated != null && (
          <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>
            {" · "}
            {t("today.weeklyAccumulated", { value: Math.round(accumulated) })}
            {remaining != null && (
              <>
                {" · "}
                <span style={{ color: `var(--${phaseTone})`, fontWeight: 600 }}>
                  {t("today.weeklyRemaining", { value: remaining })}
                </span>
              </>
            )}
          </span>
        )}
      </div>
      <div style={{ marginTop: "var(--space-2)", fontSize: "var(--fs-xs)", color: "var(--ink-2)", lineHeight: 1.5 }}>
        <span style={{ fontFamily: "var(--font-mono)", color: `var(--${phaseTone})`, fontWeight: 600 }}>
          {t("today.balanceDirection", { lo: bg.lo, hi: bg.hi })}
        </span>
        {" — "}
        {bg.note}
      </div>
    </div>
  );
}

export interface HeroCardOpts {
  tone: ToneColor;
  eyebrow: string;
  sessionName: string;
  headerChips: string[];
  factChips: FactChip[];
  narrativeText: string;
  isLLM: boolean;
  llmLoading: boolean;
  llmPhase?: "idle" | "preparing" | "calling" | "ready";
  llmCacheMiss?: boolean;
  onRequestAnalysis?: () => void;
  onReanalyze?: (() => void) | null;
  reanalyzable?: boolean;
  revalidating: boolean;
  justRecomputed: boolean;
  revalidatingMsg: string;
  revalidatedMsg: string;
  llmPreparingMsg: string;
  llmCallingMsg: string;
  cta?: { href: string; label: string; emphasis?: boolean };
  topRightExtras?: ReactNode;
  detailLine?: ReactNode;
  intervalBar?: ReactNode;
}

export function HeroCard(opts: HeroCardOpts) {
  const { t } = useTranslation("training");
  const paragraphs = opts.narrativeText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const [expanded, setExpanded] = useState(true);
  const canFold = paragraphs.length > 1;
  const visibleParagraphs = canFold && !expanded ? paragraphs.slice(0, 1) : paragraphs;
  return (
    <Card padding="none" style={{ padding: 0, borderLeft: `3px solid var(--${opts.tone})`, overflow: "hidden" }}>
      <div style={{ padding: "16px 18px 14px", background: `linear-gradient(180deg, color-mix(in oklch, var(--${opts.tone}) 6%, var(--bg-1)) 0%, var(--bg-1) 100%)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 6, flexWrap: "wrap" }}>
          <Text as="div" variant="eyebrow" style={{ color: `var(--${opts.tone})`, flexShrink: 0 }}>{opts.eyebrow}</Text>
          <RevalidatingIndicator
            visible={opts.revalidating || opts.justRecomputed}
            mode={opts.revalidating ? "updating" : "success"}
            message={opts.revalidating ? opts.revalidatingMsg : opts.revalidatedMsg}
          />
          <div style={{ flex: 1 }} />
          {opts.topRightExtras}
        </div>
        <h2 style={{ fontSize: "var(--fs-xl)", fontWeight: 700, color: "var(--ink-0)", margin: "0 0 var(--space-2)", lineHeight: 1.25, letterSpacing: "-0.01em" }}>{opts.sessionName}</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {opts.headerChips.map((chip, i) => (
            <span
              key={chip + i}
              style={{
                padding: "4px 10px",
                background: i === 0 ? `color-mix(in oklch, var(--${opts.tone}) 18%, var(--bg-2))` : "var(--bg-2)",
                border: i === 0 ? `1px solid color-mix(in oklch, var(--${opts.tone}) 40%, transparent)` : "1px solid var(--line-soft)",
                color: i === 0 ? "var(--ink-0)" : "var(--ink-2)",
                borderRadius: "var(--r-3xl)",
                fontSize: "var(--fs-xs)",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
      <div style={{ padding: "16px 18px" }}>
        {opts.factChips.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
            {opts.factChips.map((c, i) => (
              <span
                key={c.label + i}
                style={{
                  padding: "3px 8px",
                  background: c.tone ? `color-mix(in oklch, var(--${c.tone}) 10%, var(--bg-1))` : "var(--bg-1)",
                  border: `1px solid ${c.tone ? `color-mix(in oklch, var(--${c.tone}) 30%, transparent)` : "var(--line-soft)"}`,
                  color: c.tone ? `var(--${c.tone})` : "var(--ink-2)",
                  borderRadius: "var(--r-2xl)",
                  fontSize: "var(--fs-xs)",
                  fontFamily: c.mono ? "var(--font-mono)" : "inherit",
                  fontWeight: 500,
                }}
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
        {opts.detailLine}
        {opts.intervalBar}
        {opts.llmCacheMiss && opts.onRequestAnalysis && (
          <div style={{ marginTop: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <button type="button" onClick={opts.onRequestAnalysis} style={{ padding: "var(--space-2) var(--space-4)", borderRadius: "var(--r-md)", background: `color-mix(in oklch, var(--${opts.tone}) 16%, var(--bg-2))`, border: `1px solid color-mix(in oklch, var(--${opts.tone}) 40%, transparent)`, color: `var(--${opts.tone})`, fontSize: "var(--fs-xs)", fontWeight: 600, cursor: "pointer" }}>{t("today.analyzeStart")}</button>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>{t("today.analyzeWaiting")}</span>
          </div>
        )}
        {opts.onReanalyze != null && !opts.llmCacheMiss && (
          <div style={{ marginTop: "var(--space-3)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <button
              type="button"
              onClick={opts.onReanalyze ?? undefined}
              disabled={!opts.reanalyzable}
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--r-md)",
                background: opts.reanalyzable ? `color-mix(in oklch, var(--${opts.tone}) 10%, var(--bg-2))` : "var(--bg-2)",
                border: `1px solid ${opts.reanalyzable ? `color-mix(in oklch, var(--${opts.tone}) 35%, transparent)` : "var(--line-soft)"}`,
                color: opts.reanalyzable ? `var(--${opts.tone})` : "var(--ink-4)",
                fontSize: "var(--fs-xs)",
                fontWeight: 500,
                cursor: opts.reanalyzable ? "pointer" : "default",
                opacity: opts.reanalyzable ? 1 : 0.6,
              }}
            >
              {t("today.reanalyze")}
            </button>
            {!opts.reanalyzable && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>{t("today.upToDate")}</span>}
          </div>
        )}
        {(opts.llmPhase === "preparing" || opts.llmPhase === "calling") && (
          <div style={{ marginTop: "var(--space-3)", padding: "var(--space-2) var(--space-3)", background: `color-mix(in oklch, var(--${opts.tone}) 8%, var(--bg-2))`, border: `1px dashed color-mix(in oklch, var(--${opts.tone}) 35%, transparent)`, borderRadius: "var(--r-md)", fontSize: "var(--fs-xs)", color: "var(--ink-2)", display: "flex", alignItems: "center", gap: "var(--space-2)" }} aria-live="polite">
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: `var(--${opts.tone})`, animation: "pulse 1.2s ease-in-out infinite" }} />
            <span>{opts.llmPhase === "preparing" ? opts.llmPreparingMsg : opts.llmCallingMsg}</span>
          </div>
        )}
        <div style={{ marginTop: "var(--space-3)", fontSize: "var(--fs-sm)", lineHeight: 1.55, color: "var(--ink-1)", transition: "opacity .3s", opacity: opts.llmLoading && !opts.isLLM ? 0.6 : 1 }}>
          {visibleParagraphs.map((p, i) => {
            const isLede = i === 0 && paragraphs.length > 1;
            return (
              <p key={i} style={{ margin: 0, marginBottom: i === visibleParagraphs.length - 1 ? 0 : "var(--space-3)", fontSize: isLede ? 14 : "inherit", fontWeight: isLede ? 500 : 400, lineHeight: isLede ? "inherit" : 1.5, color: isLede ? "var(--ink-0)" : "var(--ink-1)", whiteSpace: "pre-wrap" }}>
                {p}
              </p>
            );
          })}
          {canFold && (
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} style={{ marginTop: "var(--space-2)", background: "transparent", border: 0, padding: 0, color: "var(--lime)", fontSize: "var(--fs-xs)", fontWeight: 500, cursor: "pointer", textDecoration: "none" }}>
              {expanded ? t("today.narrativeCollapse") : t("today.narrativeExpand", { n: paragraphs.length - 1 })}
            </button>
          )}
        </div>
        {opts.cta && (
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-3)" }}>
            <a href={opts.cta.href} className={opts.cta.emphasis ? "ds-btn ds-btn--md" : "ds-btn ds-btn--md ds-btn--ghost"} style={{ fontSize: "var(--fs-xs)" }}>{opts.cta.label}</a>
          </div>
        )}
      </div>
    </Card>
  );
}

export function renderHeroCard(opts: HeroCardOpts) {
  return <HeroCard {...opts} />;
}

export function WorkoutCardSkeleton() {
  const { t } = useTranslation("common");
  const sh = (w: number | string, h: number, extra?: CSSProperties): CSSProperties => ({
    width: w,
    height: h,
    borderRadius: "var(--r-sm)",
    background: "var(--bg-2)",
    animation: "rd-pulse 1.4s ease-in-out infinite",
    ...extra,
  });
  return (
    <Card padding="none" role="status" aria-busy="true" aria-label={t("label.loadingHint")} style={{ padding: 18, minHeight: 300, background: "var(--bg-1)" }}>
      <div style={sh("44%", 11, { marginBottom: 14 })} />
      <div style={sh("38%", 24, { marginBottom: 14 })} />
      <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
        <div style={sh(72, 26, { borderRadius: "9999px" })} />
        <div style={sh(60, 26, { borderRadius: "9999px" })} />
      </div>
      <div className="flex" style={{ gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={sh(84, 24, { borderRadius: "9999px" })} />
        <div style={sh(120, 24, { borderRadius: "9999px" })} />
        <div style={sh(72, 24, { borderRadius: "9999px" })} />
      </div>
      <div style={sh("100%", 12, { marginBottom: 18, borderRadius: "9999px" })} />
      <div style={sh("100%", 12, { marginBottom: 8 })} />
      <div style={sh("78%", 12)} />
    </Card>
  );
}
