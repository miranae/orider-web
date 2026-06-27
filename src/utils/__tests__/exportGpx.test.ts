import { describe, it, expect } from 'vitest';
import { generateGpx } from '../exportGpx';

const makeActivity = (overrides = {}) => ({
  id: 'test', userId: 'u1', nickname: 'tester', profileImage: null, type: 'ride',
  createdAt: 1700000000000, startTime: 1700000000000, endTime: 1700000060000,
  summary: { distance: 1500, ridingTimeMillis: 60000, averageSpeed: 25, maxSpeed: 35, averageCadence: 80, maxCadence: null, averageHeartRate: 130, maxHeartRate: null, averagePower: null, maxPower: null, normalizedPower: null, elevationGain: 50, calories: null, relativeEffort: null },
  thumbnailTrack: '', groupId: null, groupRideId: null, photoCount: 0, kudosCount: 0, commentCount: 0, segmentEffortCount: 0,
  description: 'Test Ride', visibility: 'everyone' as const, gpxPath: null, ...overrides,
});
const ll = [[37.5, 127.0], [37.5, 127.0], [37.5, 127.0]] as [number, number][];

describe('generateGpx', () => {
  it('relative-second time anchors to startTime', () => {
    const gpx = generateGpx(makeActivity(), { userId: 'u1', time: [0, 30, 60], latlng: ll });
    expect(gpx).toContain('<time>2023-11-14T22:13:20.000Z</time>');
    expect(gpx).toContain('<time>2023-11-14T22:14:20.000Z</time>');
  });

  it('absolute epoch-ms time does NOT overflow to year 5XXXX (regression)', () => {
    const gpx = generateGpx(makeActivity(), {
      userId: 'u1', time: [1700000000000, 1700000030000, 1700000060000], latlng: ll,
    });
    expect(gpx).not.toMatch(/<time>\+?0\d{5}-/); // 연도 오버플로우 없음
    expect(gpx).toContain('<time>2023-11-14T22:13:20.000Z</time>');
    expect(gpx).toContain('<time>2023-11-14T22:14:20.000Z</time>');
  });

  it('absolute-ms output equals relative-second output', () => {
    const rel = generateGpx(makeActivity(), { userId: 'u1', time: [0, 30, 60], latlng: ll });
    const abs = generateGpx(makeActivity(), { userId: 'u1', time: [1700000000000, 1700000030000, 1700000060000], latlng: ll });
    expect(abs).toBe(rel);
  });
});
