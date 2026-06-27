import { describe, it, expect } from 'vitest';
import { generateFit, crc16, degreesToSemicircles } from '../exportFit';

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

describe('exportFit', () => {
  describe('crc16', () => {
    it('returns 0 for empty data', () => {
      expect(crc16(new Uint8Array([]))).toBe(0);
    });

    it('computes known CRC for single byte', () => {
      const result = crc16(new Uint8Array([0x00]));
      expect(result).toBe(0x0000);
    });

    it('computes non-zero CRC for non-trivial data', () => {
      const result = crc16(new Uint8Array([0x0E, 0x14, 0x08, 0x08]));
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });
  });

  describe('degreesToSemicircles', () => {
    it('converts 0 degrees to 0', () => {
      expect(degreesToSemicircles(0)).toBe(0);
    });

    it('converts 180 degrees to 2^31', () => {
      expect(degreesToSemicircles(180)).toBe(2 ** 31);
    });

    it('converts negative degrees', () => {
      expect(degreesToSemicircles(-90)).toBe(Math.round(-90 * (2 ** 31 / 180)));
    });
  });

  describe('generateFit', () => {
    it('produces valid FIT header with ".FIT" signature', () => {
      const data = generateFit(makeActivity(), {
        userId: 'u1',
        time: [0, 1, 2],
        latlng: [[37.5, 127.0], [37.501, 127.001], [37.502, 127.002]] as [number, number][],
      });

      // 14-byte header
      expect(data[0]).toBe(14);  // header size
      expect(data[1]).toBe(20);  // protocol version
      // ".FIT" signature at bytes 8-11
      expect(String.fromCharCode(data[8]!, data[9]!, data[10]!, data[11]!)).toBe('.FIT');
    });

    it('has correct total size: header(14) + data + crc(2)', () => {
      const data = generateFit(makeActivity(), {
        userId: 'u1',
        time: [0, 1],
        latlng: [[37.5, 127.0], [37.501, 127.001]] as [number, number][],
      });

      const dataSize = data[4]! | (data[5]! << 8) | (data[6]! << 16) | (data[7]! << 24);
      expect(data.length).toBe(14 + dataSize + 2);
    });

    it('header CRC validates against data bytes 0-11', () => {
      const data = generateFit(makeActivity(), {
        userId: 'u1',
        time: [0],
        latlng: [[37.5, 127.0]] as [number, number][],
      });

      const headerCrc = crc16(data.subarray(0, 12));
      const storedCrc = data[12]! | (data[13]! << 8);
      expect(storedCrc).toBe(headerCrc);
    });

    it('handles streams without GPS', () => {
      const data = generateFit(makeActivity(), {
        userId: 'u1',
        time: [0, 1, 2],
        heartrate: [120, 125, 130],
        watts: [200, 210, 220],
      });

      expect(data[0]).toBe(14);
      expect(String.fromCharCode(data[8]!, data[9]!, data[10]!, data[11]!)).toBe('.FIT');
    });

    it('absolute epoch-ms time normalizes — byte-identical to relative-second (regression)', () => {
      // 절대 ms 가 startTimestamp + t 로 더해지면 uint32 오버플로우로 타임스탬프가 손상됐다.
      // 정규화 후엔 상대초 입력과 완전히 동일한 바이트열이 나와야 한다.
      const latlng = [[37.5, 127.0], [37.5, 127.0], [37.5, 127.0]] as [number, number][];
      const rel = generateFit(makeActivity(), { userId: 'u1', time: [0, 30, 60], latlng });
      const abs = generateFit(makeActivity(), { userId: 'u1', time: [1700000000000, 1700000030000, 1700000060000], latlng });
      expect(Array.from(abs)).toEqual(Array.from(rel));
    });
  });
});
