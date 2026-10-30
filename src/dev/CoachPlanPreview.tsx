import { MemoryRouter } from 'react-router-dom';
import type { PlanDay, PlanWeek } from '@shared/types/goal';
import { Card, Text } from '../theme';
import { DayCell, PhaseBar, PLAN_WEEK_GRID_COLUMNS } from '../features/training/plan/PlanPresentation';
import MobilePlanContent from '../features/training/plan/MobilePlanContent';
import PlanWeekLoadSummary from '../features/training/plan/PlanWeekLoadSummary';
import type { PlanLoadComparisonRow } from '../features/training/plan/planLoadComparison';
import './CoachPlanPreview.css';
const start = Date.parse('2026-10-05T00:00:00+09:00');
const workouts: PlanDay['workout'][] = ['rest', 'z2', 'ftp', 'rest', 'z2', 'z2Long', 'rest'];
const week: PlanWeek = { id: 'example-week', weekNumber: 2, phase: 'build', startDate: start, plannedTSS: 420, days: workouts.map((workout, i) => ({ date: start + i * 86400000, dayOfWeek: i as PlanDay["dayOfWeek"], workout, plannedTSS: workout === 'rest' ? 0 : workout === 'z2Long' ? 180 : 80, plannedDurationMin: workout === 'rest' ? 0 : workout === 'z2Long' ? 180 : 90, completed: false, skipped: false, ...(i === 2 ? { probableActivityId: 'example-ride', matchConfidence: 'probable' as const } : {}) })) };
const loads = new Map(week.days.map((day, i) => { const date = new Date(day.date + 9 * 3600000).toISOString().slice(0, 10); const actualTss = [0, 75, 120, 0, 80, 200, 0][i]!; const row: PlanLoadComparisonRow = { date, plannedTss: day.plannedTSS, actualTss, ratioPct: day.plannedTSS ? actualTss / day.plannedTSS * 100 : null, deltaTss: actualTss - day.plannedTSS, estimated: false, plannedDayCount: 1, unknownCount: 0, future: false, fulfilledWeek: { weekNumber: 2, plannedTss: 420, actualTss: 475, estimated: false } }; return [date, row]; }));
export default function CoachPlanPreview() {
  return <MemoryRouter><div className="coach-plan-preview__desktop"><PhaseBar weeks={[week, { ...week, id: "preview-peak", phase: "peak" }, { ...week, id: "preview-taper", phase: "taper" }]} goal={null} onReroll={() => {}} onGoalReset={() => {}} onAbandon={() => {}} /><Card padding="none"><PlanWeekLoadSummary week={week} dayLoads={loads} state="ready" /><div className="coach-plan-preview__week" style={{ gridTemplateColumns: PLAN_WEEK_GRID_COLUMNS }}><Text variant="bodyMedium">W2<br />빌드</Text>{week.days.map(day => <DayCell key={day.date} day={day} isToday={false} dayLoad={loads.get(new Date(day.date + 9 * 3600000).toISOString().slice(0, 10))} loadState="ready" />)}<Text variant="bodyMedium">420<br />TSS</Text></div></Card></div><div className="coach-plan-preview__mobile"><MobilePlanContent currentWeek={week} weekLabel="W2 · 생성 예시" dayLoads={loads} loadState="ready" /></div></MemoryRouter>;
}
