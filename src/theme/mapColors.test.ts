import { beforeEach, describe, expect, it } from 'vitest';
import { FUNCTIONAL_COLORS } from './generated';
import { PLANNED_ROUTE_COLOR, RECORDED_TRACK_COLOR, readPlannedRouteColor } from './mapColors';

describe('production map functional colors', () => {
  beforeEach(() => document.documentElement.style.removeProperty('--map-planned-route'));

  it('uses generated constants for recorded tracks and planned routes', () => {
    expect(RECORDED_TRACK_COLOR).toBe(FUNCTIONAL_COLORS.map.recordedTrack);
    expect(PLANNED_ROUTE_COLOR).toBe(FUNCTIONAL_COLORS.map.plannedRoute);
  });

  it('reads the generated planned-route CSS variable with a constant fallback', () => {
    expect(readPlannedRouteColor()).toBe(PLANNED_ROUTE_COLOR);
    document.documentElement.style.setProperty('--map-planned-route', '#123456');
    expect(readPlannedRouteColor()).toBe('#123456');
  });
});
