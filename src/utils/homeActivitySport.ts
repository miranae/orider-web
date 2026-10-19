import { getDiscipline } from './disciplineFilter';
import { isIndoorActivity, type IndoorActivityInput } from './indoorActivity';

export type HomeActivitySport = 'bike' | 'run' | 'swim' | 'indoor-bike' | 'mtb' | 'trekking';

/** 피드 아이콘만 세부 종목을 구분하며 집계·필터용 discipline은 변경하지 않는다. */
export function getHomeActivitySport(activity: IndoorActivityInput): HomeActivitySport | null {
  const type = activity.type?.trim().toLowerCase();
  const discipline = getDiscipline(type);
  if (discipline === 'bike' && isIndoorActivity(activity)) return 'indoor-bike';
  if (type === 'mountainbikeride' || type === 'emountainbikeride') return 'mtb';
  if (type === 'hike') return 'trekking';
  return discipline;
}
