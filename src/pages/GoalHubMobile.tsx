import type { Goal, PlanWeek } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";
import { ChevronRight } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../components/LocalizedLink";
import { Card, Chip, Progress, Text, buttonClass } from "../theme/components";
import { ICON_SIZE } from "../theme/tokens/icon";
import "./GoalHubMobile.css";

type Discipline = "bike" | "run" | "swim";

/** 목표 문서가 이미 가진 값만 타일로 보여 준다(새 계산 없음, 최대 3개). */
export function goalTargetTiles(goal: Goal, t: (key: string, options?: Record<string, unknown>) => string, locale: string) {
  const number = (value: number, digits = 0) => value.toLocaleString(locale, { maximumFractionDigits: digits });
  const duration = (minutes: number) => `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, "0")}`;
  const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
  const tiles: Array<{ key: string; label: string; value: string }> = [];
  if (positive(goal.courseDist)) tiles.push({ key: "distance", label: t("goalHub.tiles.distance"), value: `${number(goal.courseDist, 1)}km` });
  if (positive(goal.courseElev)) tiles.push({ key: "elevation", label: t("goalHub.tiles.elevation"), value: `${number(goal.courseElev)}m` });
  if (positive(goal.targetDurationMin)) tiles.push({ key: "time", label: t("goalHub.tiles.targetTime"), value: duration(goal.targetDurationMin) });
  if (positive(goal.target?.climbDurationMin)) tiles.push({ key: "climbTime", label: t("goalHub.tiles.targetTime"), value: duration(goal.target.climbDurationMin) });
  if (positive(goal.target?.targetWkg)) tiles.push({ key: "wkg", label: t("goalHub.tiles.targetWkg"), value: `${number(goal.target.targetWkg, 2)}W/kg` });
  return tiles.slice(0, 3);
}

/** 오늘이 저장된 계획 주차 안에 있을 때만 "N / M주" 를 만든다. 계획 밖이면 숨긴다. */
export function planWeekPosition(weeks: PlanWeek[], nowMs = Date.now()): { current: number; total: number } | null {
  if (!weeks.length) return null;
  const today = planDayKey(nowMs);
  const index = weeks.findIndex(week => week.days?.some(day => planDayKey(day.date) === today));
  return index < 0 ? null : { current: index + 1, total: weeks.length };
}

export function MobileGoalCard({ goal, title, meta, dateLabel, countdown, cached, weeks, discipline, goalReady, error }: {
  goal: Goal; title: string; meta?: string; dateLabel: string | null; countdown: string; cached: boolean;
  weeks: PlanWeek[]; discipline: Discipline; goalReady: boolean; error: boolean;
}) {
  const { t, i18n } = useTranslation("training");
  const tiles = goalTargetTiles(goal, t, i18n.resolvedLanguage ?? i18n.language);
  const position = goalReady ? planWeekPosition(weeks) : null;
  return <Card data-testid="K3-1" className="goal-mobile-card">
    <div data-testid="K3-1-1" className="goal-mobile-card__head">
      <div className="goal-mobile-card__date">
        <Text variant="bodySmall" tone="secondary">{[dateLabel, countdown].filter(Boolean).join(" · ")}</Text>
        {cached && <Chip>{t("goalHub.cachedChip")}</Chip>}
      </div>
      <Text as="h2" variant="title" style={{ overflowWrap: "anywhere", margin: 0 }}>{title}</Text>
      {meta && <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: 0 }}>{meta}</Text>}
    </div>
    {tiles.length > 0 && <dl data-testid="K3-1-6" className="goal-mobile-card__tiles">
      {tiles.map(tile => <div key={tile.key} className="goal-mobile-card__tile"><dt>{tile.label}</dt><dd>{tile.value}</dd></div>)}
    </dl>}
    {position && <div data-testid="K3-1-7" className="goal-mobile-card__progress">
      <div className="goal-mobile-card__progress-row"><span>{t("goalHub.planWeeks")}</span><span>{t("goalHub.planWeeksValue", { current: position.current, total: position.total })}</span></div>
      <Progress size="sm" value={position.current / position.total} aria-label={t("goalHub.planWeeks")} />
    </div>}
    <LocalizedLink data-testid="K3-1-3" className={buttonClass({ variant: "primary", block: true })} to={`/coach/plan?sport=${discipline}`}>{t("goalHub.planShort")}</LocalizedLink>
    {error && <Text role="alert">{t("errors.abandonError")}</Text>}
  </Card>;
}

function Row({ testId, label, hint, onClick, disabled, expanded, danger, to }: {
  testId: string; label: string; hint?: string; onClick?: () => void; disabled?: boolean; expanded?: boolean; danger?: boolean; to?: string;
}) {
  const body: ReactNode = <>
    <span className="goal-mobile-row__text"><span className="goal-mobile-row__label">{label}</span>{hint && <span className="goal-mobile-row__hint">{hint}</span>}</span>
    {!danger && <ChevronRight size={ICON_SIZE.md} aria-hidden="true" className="goal-mobile-row__chevron" />}
  </>;
  const className = `goal-mobile-row${danger ? " goal-mobile-row--danger" : ""}${hint ? " goal-mobile-row--tall" : ""}`;
  if (to) return <LocalizedLink data-testid={testId} className={className} to={to} aria-label={label}>{body}</LocalizedLink>;
  return <button type="button" data-testid={testId} className={className} onClick={onClick} disabled={disabled} aria-expanded={expanded} aria-label={label}>{body}</button>;
}

/** 목표 유형 목록. 목표가 없으면 바로, 있으면 "목표 변경" 을 눌렀을 때 보인다. */
export function MobileGoalTypeRows({ listRef, discipline, goalReady, hasRunProgram, onChoose }: {
  listRef: Ref<HTMLDivElement>; discipline: Discipline; goalReady: boolean; hasRunProgram: boolean; onChoose: (kind: "event" | "climb") => void;
}) {
  const { t } = useTranslation("training");
  return <div ref={listRef} data-testid="K3-2" role="group" aria-label={t("goalHub.new")} className="goal-mobile-rows">
    <Row testId={discipline === "bike" ? "K3-2-1" : discipline === "run" ? "K3-2-3" : "K3-2-4"} label={t(`goalHub.types.${discipline}`)}
      hint={t("goalHub.typeHints.event")} disabled={!goalReady} onClick={() => onChoose("event")} />
    {discipline === "bike" && <Row testId="K3-2-2" label={t("climbGoal.title")} hint={t("goalHub.typeHints.climb")} disabled={!goalReady} onClick={() => onChoose("climb")} />}
    {discipline === "run" && !hasRunProgram && <Row testId="K3-2-program" label={t("goalHub.program")} hint={t("goalHub.typeHints.program")} to="/coach/plan?sport=run" />}
  </div>;
}

/** 목표가 있을 때 카드 아래 줄 목록: 목표 변경 · 목표 포기. */
export function MobileGoalActions({ goalReady, changing, onToggleChange, onAbandon, canAbandon }: {
  goalReady: boolean; changing: boolean; onToggleChange: () => void; onAbandon: () => void; canAbandon: boolean;
}) {
  const { t } = useTranslation("training");
  return <div role="group" aria-label={t("goalHub.moreActions")} className="goal-mobile-rows">
    <Row testId="K3-1-4" label={t("goalHub.change")} disabled={!goalReady} expanded={changing} onClick={onToggleChange} />
    {canAbandon && <Row testId="K3-1-5" label={t("buttons.abandonGoal")} danger disabled={!goalReady} onClick={onAbandon} />}
  </div>;
}
