/**
 * 휴대폰 컨디션 탭의 한 줄 블록들 — 오늘 계획·최근 활동·목표·주간 부하.
 * 모든 숫자는 서버에 저장된 값을 그대로 읽는다(P6). 값이 없으면 숫자를 숨긴다.
 */
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../LocalizedLink";
import { Text } from "../../theme/components";
import "./MobileConditionRows.css";

export interface ConditionTodayPlan {
  /** 오늘 처방 이름(시간 포함). 캐시된 계획이 없으면 null — 「계획 보기」만 둔다. */
  label: string | null;
  planHref: string;
}

export function ConditionTodayPlanRow({ plan }: { plan: ConditionTodayPlan }) {
  const { t } = useTranslation("fitness");
  return <LocalizedLink data-testid="K1-1-3" className={`mobile-condition-row mobile-condition-row--plan${plan.label ? "" : " mobile-condition-row--plan-only"}`} to={plan.planHref}>
    {plan.label && <span className="mobile-condition-row__stack">
      <Text as="span" variant="caption" tone="secondary">{t("condition.phone.todayPlan")}</Text>
      <Text as="span" variant="bodyMedium" className="mobile-condition-row__title">{plan.label}</Text>
    </span>}
    <span className="mobile-condition-row__action">{t("condition.phone.viewPlan")}</span>
  </LocalizedLink>;
}

export interface ConditionRecentActivity {
  id: string;
  label: string;
  /** 서버가 활동에 저장한 부하(TSS). 없으면 null. */
  load: number | null;
}

export function ConditionRecentActivities({ activities, moreHref }: { activities: readonly ConditionRecentActivity[]; moreHref: string }) {
  const { t } = useTranslation("fitness");
  const headingId = useId();
  if (activities.length === 0) return null;
  return <section data-testid="K1-3" className="mobile-condition-recent" aria-labelledby={headingId}>
    <Text as="h2" variant="subtitle" id={headingId} className="mobile-condition-recent__title">{t("condition.phone.recentTitle")}</Text>
    <ul className="mobile-condition-recent__list">
      {activities.map(activity => <li key={activity.id}>
        <LocalizedLink className="mobile-condition-row mobile-condition-row--activity" to={`/activity/${encodeURIComponent(activity.id)}`}>
          <span className="mobile-condition-row__title">{activity.label}</span>
          {activity.load != null && <Text as="span" variant="bodySmall" tone="secondary" mono>{t("condition.phone.load", { value: activity.load })}</Text>}
        </LocalizedLink>
      </li>)}
    </ul>
    <LocalizedLink className="mobile-condition-row mobile-condition-row--more" to={moreHref}>{t("condition.phone.more")}</LocalizedLink>
  </section>;
}

export function ConditionGoalRow({ name, daysLeft, planHref }: { name: string; daysLeft: number | null; planHref: string }) {
  const { t } = useTranslation("fitness");
  return <LocalizedLink data-testid="K1-2-6" className="mobile-condition-row mobile-condition-row--goal" to={planHref}>
    <span className="mobile-condition-row__title">{daysLeft != null ? `${name} · D-${daysLeft}` : name}</span>
    <span className="mobile-condition-row__action">{t("condition.phone.goalPlan")}</span>
  </LocalizedLink>;
}

/** 주간 부하 접힌 한 줄. 숫자는 두지 않고, 펼치면 기존 주별 막대를 그대로 보인다. */
export function ConditionWeeklyLoadRow({ children }: { children: ReactNode }) {
  const { t } = useTranslation("fitness");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const label = t("condition.phone.weeklyLoad");
  return <div data-testid="K1-7-2" className="mobile-condition-weekly">
    <button type="button" className="mobile-condition-weekly__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(previous => !previous)}>
      <span className="mobile-condition-weekly__label">{label}</span>
      <span aria-hidden="true" className="mobile-condition-weekly__chevron">⌄</span>
    </button>
    <div id={panelId} hidden={!open}>{open && children}</div>
  </div>;
}
