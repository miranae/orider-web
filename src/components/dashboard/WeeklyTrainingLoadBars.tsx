import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { WeeklyLoadEvidence } from "../WeeklyChart";
import type { TrainingLoadPoint } from "../../utils/trainingLoadDisplay";
import { Button, Card, Text } from "../../theme/components";
import { TooltipContent } from "../../theme/components/TooltipContent";
import { LocalizedLink } from "../LocalizedLink";


export interface WeeklyTssBar extends TrainingLoadPoint {
  week: string;
  loadEvidence?: WeeklyLoadEvidence;
  /** Existing weekly distance aggregation, in kilometres. */
  distance?: number | null;
}

/** One full-height target per week; detailed links stay outside the noninteractive tooltip. */
export default function WeeklyTssBars({ weeks, tooltipFor, metric = "tss", coverage = "ready", showTrainingLoad = true, distanceFormatter }: {
  weeks: WeeklyTssBar[];
  metric?: "tss" | "distance";
  coverage?: "loading" | "ready" | "partial" | "error" | "unavailable";
  showTrainingLoad?: boolean;
  distanceFormatter?: (kilometres: number) => string;
  tooltipFor: (week: WeeklyTssBar) => string;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = (i18n.resolvedLanguage ?? i18n.language)?.startsWith("en") ? "en-US" : "ko-KR";
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const date = (value: number) => new Date(value).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", timeZone: evidence?.timeZone });
  const [activeIndex, setActiveIndex] = useState(Math.max(0, weeks.length - 1));
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 320 });
  const container = useRef<HTMLDivElement>(null);
  const anchors = useRef<Array<HTMLButtonElement | null>>([]);
  const tooltip = useRef<HTMLSpanElement>(null);
  const pinned = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const tooltipId = useId();
  const detailsId = useId();
  const index = Math.min(activeIndex, Math.max(0, weeks.length - 1));
  const active = weeks[index];
  const evidence = active?.loadEvidence && coverage === "partial" && active.tss === null
    ? { ...active.loadEvidence, total: null } : active?.loadEvidence;
  const valueFor = (week: WeeklyTssBar) => metric === "distance"
    ? (coverage === "ready" || coverage === "partial") && typeof week.distance === "number" && Number.isFinite(week.distance) && (coverage === "partial" ? week.distance > 0 : week.distance >= 0) ? week.distance : null
    : week.tss;
  const max = Math.max(...weeks.map(week => valueFor(week) ?? 0), 1);
  const titleFor = (week: WeeklyTssBar) => metric === "distance"
    ? valueFor(week) === null ? t("weeklyEvidence.distanceUnknownTitle", { week: week.week })
      : distanceFormatter ? t("weeklyEvidence.distanceFormattedTitle", { week: week.week, distance: distanceFormatter(valueFor(week)!), partial: coverage === "partial" ? "+" : "" })
        : t(coverage === "partial" ? "weeklyEvidence.distancePartialTitle" : "weeklyEvidence.distanceTitle", { week: week.week, value: number(valueFor(week)!) })
    : week.tss === null ? t("weeklyEvidence.tooltipUnknownTitle", { week: week.week }) : t("weeklyEvidence.tooltipTitle", { week: week.week, value: number(week.tss) });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchors.current[index]?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 16);
      const height = Math.min(tooltip.current?.getBoundingClientRect().height || 280, window.innerHeight - 16);
      setPosition({ width, left: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
        top: Math.max(8, rect.top >= height + 8 ? rect.top - height - 8 : Math.min(rect.bottom + 8, window.innerHeight - height - 8)) });
    };
    const dismiss = (event: Event) => {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "pointerdown" && (container.current?.contains(event.target as Node) || tooltip.current?.contains(event.target as Node))) return;
      pinned.current = false;
      setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open, index, active, coverage, locale]);

  useEffect(() => { setOpen(false); setDetailsOpen(false); pinned.current = false; }, [metric]);

  function select(next: number) { clearTimeout(closeTimer.current); setActiveIndex(next); setOpen(true); }
  function leave() { if (!pinned.current && !anchors.current.includes(document.activeElement as HTMLButtonElement)) closeTimer.current = setTimeout(() => setOpen(false), 120); }
  const period = evidence ? `${date(evidence.periodStartMs)} – ${date(evidence.periodEndMs - 1)} (${evidence.timeZone})` : null;
  const basisItems = evidence ? (["power", "heartRate", "time", "unknown"] as const)
    .map(basis => ({ basis, value: evidence.basisTotals[basis] })).filter(item => item.value > 0 || evidence.rows.some(row => row.basis === item.basis && row.value !== null)) : [];
  const basisBreakdown = evidence && evidence.total !== null && <span className="flex flex-col gap-1">
    {basisItems.map(item => <span key={item.basis} className="flex justify-between gap-3">
      <Text variant="bodySmall">{t(`weeklyEvidence.basis.${item.basis}`)}</Text>
      <Text variant="bodySmall" mono weight={600}>{number(item.value)} TSS</Text>
    </span>)}
  </span>;
  return <div ref={container}>
    <div style={{ display: "grid", gridTemplateColumns: metric === "distance" ? "max-content minmax(0, 1fr)" : "minmax(0, 1fr)", columnGap: "var(--space-2)" }}>
    {metric === "distance" && <div aria-hidden="true" data-testid="weekly-distance-scale" style={{ height: 80, display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "right" }}>
      <Text variant="caption" tone="tertiary" mono>{weeks.some(week => valueFor(week) !== null) ? distanceFormatter ? distanceFormatter(max) : `${number(max)} km` : "—"}</Text>
      <Text variant="caption" tone="tertiary" mono>0</Text>
    </div>}
    <div className="bar-track" style={{ height: 80, gap: 1, boxShadow: metric === "distance" ? "inset 0 -1px var(--line)" : undefined }}>
      {weeks.map((week, weekIndex) => <button
        key={week.week} data-week-index={weekIndex} ref={node => { anchors.current[weekIndex] = node; }} type="button"
        aria-label={metric === "distance" ? titleFor(week) : tooltipFor(week)} aria-describedby={open && index === weekIndex ? tooltipId : undefined}
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lime)]"
        style={{ position: "relative", height: "100%", flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", padding: 0, border: 0, background: "transparent", cursor: "pointer", borderRadius: "var(--r-sm)" }}
        onPointerEnter={() => { if (!pinned.current) select(weekIndex); }}
        onPointerLeave={() => { if (document.activeElement !== anchors.current[weekIndex]) leave(); }}
        onFocus={() => { pinned.current = false; select(weekIndex); }}
        onBlur={() => { pinned.current = false; setOpen(false); }}
        onClick={() => { clearTimeout(closeTimer.current); setActiveIndex(weekIndex); pinned.current = !pinned.current; setOpen(pinned.current); }}
      ><span aria-hidden="true" className={valueFor(week) == null ? "bar bar--unknown" : `bar ${weekIndex === weeks.length - 1 ? "bar--current" : ""}`}
        data-testid={`weekly-${metric}-bar${valueFor(week) == null ? "-unknown" : ""}`}
        style={{ height: valueFor(week) == null ? "100%" : `${Math.round(valueFor(week)! / max * 100)}%`, opacity: open && index !== weekIndex ? 0.5 : 1, display: "block" }} />
        {valueFor(week) === 0 && <span aria-hidden="true" data-testid="weekly-zero-marker" data-current-week={weekIndex === weeks.length - 1}
          style={{ position: "absolute", bottom: 0, left: 0, width: "100%", borderBottom: `1px solid ${weekIndex === weeks.length - 1 ? "var(--lime)" : "var(--ink-3)"}` }}>
          {weekIndex === weeks.length - 1 && <Text variant="caption" mono style={{ position: "absolute", bottom: "var(--space-1)", left: "50%", transform: "translateX(-50%)", color: "var(--ink-1)" }}>0</Text>}
        </span>}
      </button>)}
    </div>
    {weeks.length > 0 && <div aria-hidden="true" data-testid="weekly-chart-ticks" className="flex" style={{ marginTop: "var(--space-2)", gap: 1, gridColumn: metric === "distance" ? 2 : 1 }}>
      {weeks.map((week, weekIndex) => <div key={week.week} data-week-index={weekIndex} style={{ flex: 1, minWidth: 0, textAlign: weekIndex === 0 ? "left" : weekIndex === weeks.length - 1 ? "right" : "center" }}>
        {(weekIndex === 0 || weekIndex === Math.floor(weeks.length / 2) || weekIndex === weeks.length - 1) && <Text as="div" variant="caption" tone="tertiary" mono style={{ position: "relative", width: "max-content", whiteSpace: "nowrap", left: weekIndex === 0 ? 0 : weekIndex === weeks.length - 1 ? "100%" : "50%", transform: weekIndex === 0 ? undefined : weekIndex === weeks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{week.week}</Text>}
        {weekIndex === weeks.length - 1 && <Text as="div" variant="caption" style={{ position: "relative", left: "100%", transform: "translateX(-100%)", width: "max-content", whiteSpace: "nowrap", color: "var(--ink-1)" }}>{t("sidebar.weeklyTss.thisWeek")}</Text>}
      </div>)}
    </div>}
    </div>
    {showTrainingLoad && active && <Button variant="ghost" size="sm" aria-expanded={detailsOpen} aria-controls={detailsId}
      onClick={() => { setOpen(false); pinned.current = false; setDetailsOpen(value => !value); }} style={{ marginTop: "var(--space-2)" }}>
      {t(detailsOpen ? "weeklyEvidence.hideDetails" : "weeklyEvidence.showDetails", { week: active.week })}
    </Button>}
    {open && active && createPortal(<TooltipContent ref={tooltip} id={tooltipId} role="tooltip" title={titleFor(active)}
      onPointerEnter={() => { clearTimeout(closeTimer.current); setOpen(true); }} onPointerLeave={leave}
      style={{ position: "fixed", ...position, zIndex: 100, maxHeight: "calc(100dvh - 16px)", overflowY: "auto" }}>
      <span className="flex flex-col gap-2">
        {metric === "distance" ? showTrainingLoad && <Text variant="caption" tone="tertiary">{`TSS ${active.tss === null ? "—" : `${active.tssEstimated ? "≈" : ""}${number(active.tss)}${active.tssUnknownCount ? "+" : ""}`}` }</Text> : evidence ? <>
          {evidence.total === null && <Text variant="bodySmall">{t("weeklyEvidence.loadUnknown")}</Text>}
          {basisBreakdown}
        </> : t("weeklyEvidence.noEvidence")}
        {metric === "tss" && typeof active.distance === "number" && Number.isFinite(active.distance) && active.distance >= 0 && <Text variant="caption" tone="tertiary" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: "var(--space-2)" }}>{t("weeklyEvidence.distance", { value: number(active.distance) })}</Text>}
      </span>
    </TooltipContent>, document.body)}
    {showTrainingLoad && detailsOpen && active && <Card id={detailsId} role="region" aria-label={t("weeklyEvidence.detailsTitle", { week: active.week })} variant="inset" padding="compact" style={{ marginTop: "var(--space-2)" }}>
      <Text as="h3" variant="bodyMedium" weight={600}>{t("weeklyEvidence.shortTitle", { week: active.week })}</Text>
      <Text as="p" variant="caption" tone="tertiary">{period}</Text>
      {evidence ? <>
        <div className="flex flex-col gap-2" style={{ marginTop: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <Text as="p" variant="caption">{t(`weeklyEvidence.scope.${evidence.scope}`)}</Text>
          <div><Text as="p" variant="caption">{t("weeklyEvidence.totalLabel")}</Text><Text variant="dataMedium" mono>{evidence.total === null ? t("weeklyEvidence.unknown") : `${evidence.estimated || active.tssEstimated ? "≈" : ""}${number(evidence.total)}${coverage === "partial" || evidence.coverage === "partial" || evidence.unknownCount > 0 || active.tssUnknownCount ? "+" : ""}`}</Text>{evidence.total !== null && <Text variant="unit"> TSS</Text>}</div>
          {basisBreakdown}
        </div>
        <Text as="p" variant="caption">{t("weeklyEvidence.activityInputs")}</Text>
        <ul className="flex flex-col gap-3" style={{ marginTop: "var(--space-2)", maxHeight: "min(50vh, calc(var(--space-8) * 8))", overflowY: "auto", paddingLeft: 0, listStyle: "none" }}>
          {evidence.rows.map(row => <li key={row.activityId} style={{ borderTop: "1px solid var(--line-soft)", paddingTop: "var(--space-2)" }}>
            <LocalizedLink to={`/activity/${encodeURIComponent(row.activityId)}`}><Text variant="bodyMedium" weight={600} style={{ overflowWrap: "anywhere" }}>{row.title || t("weeklyEvidence.untitled")}</Text></LocalizedLink>
            <Text as="p" variant="caption">{date(row.startTime)} · {t(`weeklyEvidence.scope.${row.discipline}`)}</Text>
            <Text as="p" variant="bodySmall">{t(`weeklyEvidence.basis.${row.basis === "excluded" ? "excluded" : row.basis}`)} · {row.value === null ? t("weeklyEvidence.unknown") : `${number(row.value)} TSS`}</Text>
            {row.input && <Text as="p" variant="caption" mono>{row.input.kind === "time"
              ? t("weeklyEvidence.timeInput", { minutes: number(row.input.durationMillis / 60000), factor: number(row.input.factor) })
              : t(`weeklyEvidence.input.${row.input.kind}`, { value: number(row.input.value) })}</Text>}
          </li>)}
        </ul>

      </> : <Text as="p" variant="bodySmall" tone="tertiary">{t("weeklyEvidence.noEvidence")}</Text>}
    </Card>}
  </div>;
}
