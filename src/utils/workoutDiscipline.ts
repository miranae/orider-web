import type { WorkoutKind } from "@shared/types/goal";

export type Discipline = "bike" | "run" | "swim";

const RUN_KINDS = new Set<WorkoutKind>(['easyRun', 'tempoRun', 'intervalRun', 'longRun', 'recoveryRun', 'stridesRun', 'progressRun', 'threshRun', 'raceRun']);
const SWIM_KINDS = new Set<WorkoutKind>(['easySwim', 'drillSwim', 'intervalSwim', 'longSwim', 'recoverySwim', 'kickSwim', 'enduranceSwim', 'cssSwim', 'racepaceSwim', 'sprintSwim', 'owSwim', 'brickSwim']);

export function getWorkoutDiscipline(workout: WorkoutKind | string, goalDiscipline?: Discipline | 'tri'): Discipline | 'rest' {
  if (workout === 'rest') return 'rest';
  if (RUN_KINDS.has(workout as WorkoutKind)) return 'run';
  if (SWIM_KINDS.has(workout as WorkoutKind)) return 'swim';
  if (KINDS_BY_DISCIPLINE.bike.includes(workout as WorkoutKind) || workout === 'goal') {
    if (goalDiscipline === 'run' || goalDiscipline === 'swim') return goalDiscipline;
  }
  return 'bike';
}

export const KINDS_BY_DISCIPLINE: Record<Discipline, WorkoutKind[]> = {
  bike: ['rec', 'z2', 'z2Long', 'tempo', 'ftp', 'vo2', 'hillRepeats', 'sim'],
  run: [...RUN_KINDS] as WorkoutKind[],
  swim: [...SWIM_KINDS] as WorkoutKind[],
};
