import { describe, expect, it } from 'vitest';
import { FIXTURE_RECORDS, fixtureDomain, fixtureNearest, fixtureObservedMean, fixtureRoutePath, FIXTURE_SUMMARY_ROWS, FIXTURE_COMBO_SAMPLES, sortFixtureSummaries } from './designSystemFixture';

describe('design-system fixture interaction data', () => {
  it('sorts summary values without converting missing observations into zero', () => {
    for (const direction of ['ascending', 'descending'] as const) {
      const result = sortFixtureSummaries(FIXTURE_SUMMARY_ROWS, 'power', direction);
      expect(result[result.length - 1]!.id).toBe('fixture-missing');
      expect(result.find(row => row.id === 'fixture-zero')!.power).toBe(0);
    }
    expect(sortFixtureSummaries(FIXTURE_SUMMARY_ROWS, 'distance', 'ascending')[0]!.id).toBe('fixture-zero');
    expect(FIXTURE_SUMMARY_ROWS[0]!.id).toBe('fixture-0');
  });

  it('keeps mixed-chart fixture sparse with genuine missing and zero samples', () => {
    expect(FIXTURE_COMBO_SAMPLES).toHaveLength(22);
    expect(FIXTURE_COMBO_SAMPLES.find(sample => sample.time === 39)?.power).toBeNull();
    expect(FIXTURE_COMBO_SAMPLES.find(sample => sample.time === 63)?.power).toBe(0);
    expect(FIXTURE_COMBO_SAMPLES[FIXTURE_COMBO_SAMPLES.length - 1]!.time).toBe(90);
  });

  it('keeps distance and actual-clock domains distinct including the later start', () => {
    expect(fixtureDomain('distance')).toEqual([0, 32.4]);
    expect(fixtureDomain('time')).toEqual([0, 92]);
    expect(fixtureNearest(FIXTURE_RECORDS[1]!, 0, 'time')).toBeNull();
    expect(fixtureNearest(FIXTURE_RECORDS[1]!, 2, 'time')).toBe(FIXTURE_RECORDS[1]!.samples[0]);
  });

  it('preserves missing observations and genuine zero power or speed', () => {
    const record = FIXTURE_RECORDS[0]!;
    expect(fixtureNearest(record, 76 * .18, 'distance')?.hr).toBeNull();
    expect(fixtureNearest(record, 127 * .18, 'distance')?.power).toBe(0);
    expect(fixtureObservedMean(record, 'power', 'time', [63, 64])).toBe(0);
    expect(fixtureObservedMean(record, 'hr', 'time', [37.5, 40])).toBeNull();
  });

  it('uses selected window intersections and does not extend the last sample', () => {
    const record = FIXTURE_RECORDS[0]!;
    const value = record.samples[20]!.power!;
    expect(fixtureObservedMean(record, 'power', 'time', [10.1, 10.4])).toBeCloseTo(value);
    expect(fixtureObservedMean(record, 'power', 'time', [90, 92])).toBeNull();
    expect(fixtureObservedMean(record, 'speed', 'distance', [10, 20])).not.toEqual(fixtureObservedMean(record, 'speed', 'distance', [0, 32.4]));
  });

  it('generates a smaller route subsection for highlighted chart windows', () => {
    const path = fixtureRoutePath(.25, .5);
    expect(path).not.toEqual(fixtureRoutePath());
    expect(path).toMatch(/^M181\.00 /);
    expect(path).toContain('L300.00 ');
  });
});
