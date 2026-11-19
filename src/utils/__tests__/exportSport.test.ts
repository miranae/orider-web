import { describe, it, expect } from 'vitest';
import { exportFilename, exportSportOf } from '../exportSport';

describe('exportSportOf', () => {
  it.each([
    ['Run', 1, 0, 'Running', 'running'],
    ['TrailRun', 1, 3, 'Running', 'running'],
    ['VirtualRun', 1, 58, 'Running', 'running'],
    ['Walk', 11, 0, 'Other', 'walking'],
    ['Hike', 17, 0, 'Other', 'hiking'],
    ['Ride', 2, 0, 'Biking', 'cycling'],
    ['ride', 2, 0, 'Biking', 'cycling'],
    ['GravelRide', 2, 0, 'Biking', 'cycling'],
    ['VirtualRide', 2, 58, 'Biking', 'cycling'],
    ['indoor_cycling', 2, 58, 'Biking', 'cycling'],
    ['Swim', 5, 0, 'Other', 'swimming'],
  ] as const)('%s → FIT %i/%i, TCX %s, GPX %s', (type, fitSport, fitSubSport, tcxSport, gpxType) => {
    expect(exportSportOf({ type })).toMatchObject({ fitSport, fitSubSport, tcxSport, gpxType });
  });

  it('does not fall back to cycling for untracked sports', () => {
    for (const type of ['Workout', 'Yoga', '']) {
      expect(exportSportOf({ type })).toEqual({ fitSport: 0, fitSubSport: 0, tcxSport: 'Other', gpxType: null, label: 'Activity', footCadence: false });
    }
  });
});

describe('exportFilename', () => {
  const startTime = Date.UTC(2026, 10, 17, 0, 12, 47);

  it('names an undescribed activity after its sport', () => {
    expect(exportFilename({ type: 'Run', startTime, description: '' }, 'fit')).toBe('20261117_run.fit');
  });

  it('keeps the sanitized description when present', () => {
    expect(exportFilename({ type: 'Run', startTime, description: '공원 반복!' }, 'gpx')).toBe('20261117_공원_반복_.gpx');
  });
});
