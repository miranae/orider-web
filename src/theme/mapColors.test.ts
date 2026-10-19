import { beforeEach, describe, expect, it } from 'vitest';
import { PLANNED_ROUTE_COLOR, readPlannedRouteColor } from './mapColors';

describe('production map functional colors', () => {
  beforeEach(() => document.documentElement.style.removeProperty('--map-planned-route'));

  it('reads the generated planned-route CSS variable with a constant fallback', () => {
    expect(readPlannedRouteColor()).toBe(PLANNED_ROUTE_COLOR);
    document.documentElement.style.setProperty('--map-planned-route', '#123456');
    expect(readPlannedRouteColor()).toBe('#123456');
  });
});
