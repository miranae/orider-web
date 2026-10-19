import { describe, expect, it } from 'vitest';
import { getHomeActivitySport } from './homeActivitySport';

describe('Home activity artwork selection', () => {
  it.each([
    [{ type: 'Ride' }, 'bike'],
    [{ type: 'VirtualRide' }, 'indoor-bike'],
    [{ type: 'Ride', trainer: true }, 'indoor-bike'],
    [{ type: 'MountainBikeRide' }, 'mtb'],
    [{ type: 'EMountainBikeRide' }, 'mtb'],
    [{ type: 'MountainBikeRide', trainer: true }, 'indoor-bike'],
    [{ type: 'Hike' }, 'trekking'],
    [{ type: 'Walk' }, 'run'],
    [{ type: 'TrailRun' }, 'run'],
    [{ type: 'VirtualRun', trainer: true }, 'run'],
    [{ type: 'Swim' }, 'swim'],
    [{ type: 'Yoga', trainer: true }, null],
    [{}, null],
  ] as const)('selects %j → %s without relabelling unrelated sports', (activity, expected) => {
    expect(getHomeActivitySport(activity)).toBe(expected);
  });
});
