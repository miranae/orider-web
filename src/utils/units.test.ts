import { describe, expect, it } from 'vitest';
import {
  formatDistance,
  formatSpeed,
  formatPace,
  formatElev,
  formatTemp,
  formatWeight,
} from './units';

describe('formatDistance', () => {
  it('metric: meters → km with 1 decimal', () => {
    expect(formatDistance(12340, 'metric')).toBe('12.3km');
  });
  it('imperial: meters → mi with 1 decimal', () => {
    expect(formatDistance(12340, 'imperial')).toBe('7.7mi');
  });
  it('metric < 1km uses meters', () => {
    expect(formatDistance(450, 'metric')).toBe('450m');
  });
});

describe('formatSpeed', () => {
  it('metric bike: m/s → km/h', () => {
    expect(formatSpeed(10, 'metric', 'bike')).toBe('36.0km/h');
  });
  it('imperial bike: m/s → mph', () => {
    expect(formatSpeed(10, 'imperial', 'bike')).toBe('22.4mph');
  });
});

describe('formatPace', () => {
  it('metric run: sec/km → m:ss/km', () => {
    expect(formatPace(330, 'metric')).toBe('5:30/km');
  });
  it('imperial run: sec/km → m:ss/mi', () => {
    expect(formatPace(330, 'imperial')).toBe('8:51/mi');
  });
  it('rolls over when seconds round up to 60 (metric)', () => {
    expect(formatPace(359.6, 'metric')).toBe('6:00/km');
  });
  it('rolls over when seconds round up to 60 (imperial)', () => {
    expect(formatPace(372.64, 'imperial')).toBe('10:00/mi');
  });
});

describe('formatElev', () => {
  it('metric: m', () => expect(formatElev(234, 'metric')).toBe('234m'));
  it('imperial: ft', () => expect(formatElev(234, 'imperial')).toBe('768ft'));
});

describe('formatTemp', () => {
  it('metric: °C', () => expect(formatTemp(23, 'metric')).toBe('23°C'));
  it('imperial: °F', () => expect(formatTemp(23, 'imperial')).toBe('73°F'));
});

describe('formatWeight', () => {
  it('metric: kg', () => expect(formatWeight(72.5, 'metric')).toBe('72.5kg'));
  it('imperial: lb', () => expect(formatWeight(72.5, 'imperial')).toBe('159.8lb'));
});
