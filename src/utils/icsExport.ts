import type { PlanWeek } from "@shared/types/goal";

type TFunction = (key: string, options?: Record<string, unknown>) => string;

const WORKOUT_KEY_MAP: Record<string, string> = {
  rest: 'export.workoutLabel.rest',
  rec: 'export.workoutLabel.rec',
  z2: 'export.workoutLabel.z2',
  z2Long: 'export.workoutLabel.z2Long',
  tempo: 'export.workoutLabel.tempo',
  ftp: 'export.workoutLabel.ftp',
  vo2: 'export.workoutLabel.vo2',
  sim: 'export.workoutLabel.sim',
  goal: 'export.workoutLabel.goal',
};

export function generateICS(weeks: PlanWeek[], goalName: string, t: TFunction): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Orider//Training Plan//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${t('export.icsCalName', { goalName })}`,
  ];

  for (const week of weeks) {
    for (const day of week.days) {
      if (day.workout === 'rest') continue;

      const labelKey = WORKOUT_KEY_MAP[day.workout];
      const label = labelKey ? t(labelKey) : day.workout;
      const summary = `[Orider] ${label} · ${day.plannedDurationMin}min · ${day.plannedTSS} TSS`;

      // KST 자정 타임스탬프를 날짜 문자열로 변환
      const d = new Date(day.date + 9 * 3600000); // KST 오프셋 적용
      const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');

      // 시간/분 단위 Duration
      const hours = Math.floor(day.plannedDurationMin / 60);
      const mins = day.plannedDurationMin % 60;
      const duration = `PT${hours}H${mins}M`;

      // 고유 UID
      const uid = `orider-plan-${dateStr}-${day.workout}@orider.co.kr`;

      lines.push('BEGIN:VEVENT');
      lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
      lines.push(`DURATION:${duration}`);
      lines.push(`SUMMARY:${summary}`);
      lines.push(`DESCRIPTION:${t('export.icsDescWeek', { weekNumber: week.weekNumber, phase: week.phase, tss: day.plannedTSS })}`);
      lines.push(`UID:${uid}`);
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
