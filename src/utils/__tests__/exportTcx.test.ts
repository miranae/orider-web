import { describe, it, expect } from 'vitest';
import { generateTcx } from '../exportTcx';

const makeActivity = (overrides = {}) => ({
  id: 'test',
  userId: 'u1',
  nickname: 'tester',
  profileImage: null,
  type: 'ride',
  createdAt: 1700000000000,
  startTime: 1700000000000,
  endTime: 1700000060000,
  summary: { distance: 1500, ridingTimeMillis: 60000, averageSpeed: 25, maxSpeed: 35, averageCadence: 80, maxCadence: null, averageHeartRate: 130, maxHeartRate: null, averagePower: null, maxPower: null, normalizedPower: null, elevationGain: 50, calories: null, relativeEffort: null },
  thumbnailTrack: '',
  groupId: null,
  groupRideId: null,
  photoCount: 0,
  kudosCount: 0,
  commentCount: 0,
  segmentEffortCount: 0,
  description: 'Test Ride',
  visibility: 'everyone' as const,
  gpxPath: null,
  ...overrides,
});

describe('generateTcx', () => {
  it('generates valid TCX with trackpoints', () => {
    const activity = makeActivity();
    const streams = {
      userId: 'u1',
      time: [0, 1, 2],
      latlng: [[37.5, 127.0], [37.501, 127.001], [37.502, 127.002]] as [number, number][],
      altitude: [100, 101, 102],
      heartrate: [120, 125, 130],
      watts: [200, 210, 220],
    };
    const tcx = generateTcx(activity, streams);
    expect(tcx).toContain('<Activity Sport="Biking">');
    expect(tcx).toContain('<LatitudeDegrees>37.5</LatitudeDegrees>');
    expect(tcx).toContain('<ext:Watts>200</ext:Watts>');
    expect(tcx).toContain('</TrainingCenterDatabase>');
  });

  it('relative-second time stays anchored to startTime (no overflow)', () => {
    const activity = makeActivity(); // startTime 1700000000000 = 2023-11-14T22:13:20.000Z
    const streams = { userId: 'u1', time: [0, 30, 60], latlng: [[37.5, 127.0], [37.5, 127.0], [37.5, 127.0]] as [number, number][] };
    const tcx = generateTcx(activity, streams);
    expect(tcx).toContain('<Time>2023-11-14T22:13:20.000Z</Time>'); // t=0 → start
    expect(tcx).toContain('<Time>2023-11-14T22:14:20.000Z</Time>'); // t=60 → +60s
  });

  it('absolute epoch-ms time does NOT overflow to year 5XXXX (regression)', () => {
    // 일부 활동의 streams.time 은 절대 epoch 밀리초로 저장된다. 과거엔 *1000 돼 서기 58488년이 됐다.
    const activity = makeActivity({ startTime: 1700000000000 });
    const streams = {
      userId: 'u1',
      time: [1700000000000, 1700000030000, 1700000060000], // 절대 ms, 0/30/60초 간격
      latlng: [[37.5, 127.0], [37.5, 127.0], [37.5, 127.0]] as [number, number][],
    };
    const tcx = generateTcx(activity, streams);
    expect(tcx).not.toMatch(/<Time>\+?0\d{5}-/); // +0XXXXX- 같은 연도 오버플로우 없음
    expect(tcx).toContain('<Time>2023-11-14T22:13:20.000Z</Time>'); // 첫 포인트 = start
    expect(tcx).toContain('<Time>2023-11-14T22:14:20.000Z</Time>'); // +60s
  });

  it('absolute epoch-seconds time normalizes correctly', () => {
    const activity = makeActivity({ startTime: 1700000000000 });
    const streams = {
      userId: 'u1',
      time: [1700000000, 1700000030, 1700000060], // 절대 초
      latlng: [[37.5, 127.0], [37.5, 127.0], [37.5, 127.0]] as [number, number][],
    };
    const tcx = generateTcx(activity, streams);
    expect(tcx).not.toMatch(/<Time>\+?0\d{5}-/);
    expect(tcx).toContain('<Time>2023-11-14T22:14:20.000Z</Time>'); // +60s
  });

  it('handles missing optional streams', () => {
    const activity = makeActivity();
    const streams = {
      userId: 'u1',
      time: [0, 1],
      latlng: [[37.5, 127.0], [37.501, 127.001]] as [number, number][],
    };
    const tcx = generateTcx(activity, streams);
    expect(tcx).toContain('<Activity Sport="Biking">');
    expect(tcx).not.toContain('<HeartRateBpm>');
    expect(tcx).not.toContain('<ext:Watts>');
  });
});
