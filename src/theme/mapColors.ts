import { FUNCTIONAL_COLORS } from './generated';

export const RECORDED_TRACK_COLOR = FUNCTIONAL_COLORS.map.recordedTrack;
export const PLANNED_ROUTE_COLOR = FUNCTIONAL_COLORS.map.plannedRoute;

export function readPlannedRouteColor(): string {
  if (typeof window === 'undefined') return PLANNED_ROUTE_COLOR;
  return getComputedStyle(document.documentElement).getPropertyValue('--map-planned-route').trim()
    || PLANNED_ROUTE_COLOR;
}
