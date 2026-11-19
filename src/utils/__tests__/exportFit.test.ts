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

/** Reads sport/sub_sport from the session message (global 18). The writer uses no compressed headers or developer fields. */
function readSessionSport(data: Uint8Array): { sport: number; subSport: number } {
  const end = data[0]! + (data[4]! | (data[5]! << 8) | (data[6]! << 16) | (data[7]! << 24));
  const definitions = new Map<number, { global: number; fields: [number, number][] }>();
  let i = data[0]!;
  while (i < end) {
    const header = data[i++]!;
    const local = header & 0x0f;
    if (header & 0x40) {
      const count = data[i + 4]!;
      const fields: [number, number][] = [];
      for (let f = 0; f < count; f++) fields.push([data[i + 5 + f * 3]!, data[i + 6 + f * 3]!]);
      definitions.set(local, { global: data[i + 2]! | (data[i + 3]! << 8), fields });
      i += 5 + count * 3;
      continue;
    }
    const definition = definitions.get(local)!;
    const values = new Map<number, number>();
    for (const [num, size] of definition.fields) {
      if (size === 1) values.set(num, data[i]!);
      i += size;
    }
    if (definition.global === 18) return { sport: values.get(5)!, subSport: values.get(6)! };
  }
  throw new Error('session message not found');
}

/** Reads cadence (field 4) and fractional_cadence (field 53) from every record message (global 20). */
function readRecordCadence(data: Uint8Array): { fields: number[]; cadence: number[]; fractional: number[] } {
  const end = data[0]! + (data[4]! | (data[5]! << 8) | (data[6]! << 16) | (data[7]! << 24));
  const definitions = new Map<number, { global: number; fields: [number, number][] }>();
  const out = { fields: [] as number[], cadence: [] as number[], fractional: [] as number[] };
  let i = data[0]!;
  while (i < end) {
    const header = data[i++]!;
    const local = header & 0x0f;
    if (header & 0x40) {
      const count = data[i + 4]!;
      const fields: [number, number][] = [];
      for (let f = 0; f < count; f++) fields.push([data[i + 5 + f * 3]!, data[i + 6 + f * 3]!]);
      const global = data[i + 2]! | (data[i + 3]! << 8);
      definitions.set(local, { global, fields });
      if (global === 20) out.fields = fields.map(([num]) => num);
      i += 5 + count * 3;
      continue;
    }
    const definition = definitions.get(local)!;
    for (const [num, size] of definition.fields) {
      if (definition.global === 20 && num === 4) out.cadence.push(data[i]!);
      if (definition.global === 20 && num === 53) out.fractional.push(data[i]!);
      i += size;
    }
  }
  return out;
}

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
      expect(data[1]).toBe(0x20);  // protocol version
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

    it('encodes velocity_smooth as meters per second with FIT speed scale 1000', () => {
      const data = generateFit(makeActivity(), {
        userId: 'u1',
        time: [0],
        velocity_smooth: [10],
      });

      const fileIdDefinitionSize = 1 + 1 + 1 + 2 + 1 + 5 * 3;
      const fileIdDataSize = 1 + 1 + 2 + 2 + 4 + 4;
      const recordDefinitionSize = 1 + 1 + 1 + 2 + 1 + 2 * 3;
      const firstRecordOffset = 14 + fileIdDefinitionSize + fileIdDataSize + recordDefinitionSize;
      const speedOffset = firstRecordOffset + 1 + 4;
      const encodedSpeed = data[speedOffset]! | (data[speedOffset + 1]! << 8);

      expect(encodedSpeed).toBe(10_000);
    });

    it('encodes missing altitude as FIT invalid value', () => {
      const data = generateFit(makeActivity(), {
        userId: 'u1',
        time: [0],
        altitude: [null as unknown as number],
      });

      const fileIdDefinitionSize = 1 + 1 + 1 + 2 + 1 + 5 * 3;
      const fileIdDataSize = 1 + 1 + 2 + 2 + 4 + 4;
      const recordDefinitionSize = 1 + 1 + 1 + 2 + 1 + 2 * 3;
      const firstRecordOffset = 14 + fileIdDefinitionSize + fileIdDataSize + recordDefinitionSize;
      const altitudeOffset = firstRecordOffset + 1 + 4;
      const encodedAltitude = data[altitudeOffset]! | (data[altitudeOffset + 1]! << 8);

      expect(encodedAltitude).toBe(0xFFFF);
    });

    it('writes one-foot cadence for an Orider run stored in spm, keeping the half step', () => {
      const streams = { userId: 'u1', time: [0, 1, 2], cadence: [168, 169, 170] };
      const read = readRecordCadence(generateFit(makeActivity({ type: 'Run' }), streams, 'spm'));
      expect(read.cadence).toEqual([84, 84, 85]);
      expect(read.fractional).toEqual([0, 64, 0]);
    });

    it('keeps a run already stored in strides per minute', () => {
      const streams = { userId: 'u1', time: [0, 1], cadence: [84, 85] };
      const read = readRecordCadence(generateFit(makeActivity({ type: 'Run' }), streams, 'strides_per_minute'));
      expect(read.cadence).toEqual([84, 85]);
      expect(read.fractional).toEqual([0, 0]);
    });

    it('omits run cadence when its unit is unknown instead of guessing', () => {
      const streams = { userId: 'u1', time: [0, 1], cadence: [168, 169] };
      const read = readRecordCadence(generateFit(makeActivity({ type: 'Run' }), streams, null));
      expect(read.fields).not.toContain(4);
      expect(read.fields).not.toContain(53);
    });

    it('keeps cycling cadence in rpm without a fractional field', () => {
      const streams = { userId: 'u1', time: [0, 1], cadence: [90, 91] };
      const read = readRecordCadence(generateFit(makeActivity({ type: 'Ride' }), streams, 'rpm'));
      expect(read.cadence).toEqual([90, 91]);
      expect(read.fields).not.toContain(53);
    });

    it('writes the activity sport to the session instead of always cycling', () => {
      const streams = { userId: 'u1', time: [0, 1], latlng: [[37.5, 127.0], [37.501, 127.001]] as [number, number][] };
      expect(readSessionSport(generateFit(makeActivity({ type: 'Run' }), streams))).toEqual({ sport: 1, subSport: 0 });
      expect(readSessionSport(generateFit(makeActivity({ type: 'ride' }), streams))).toEqual({ sport: 2, subSport: 0 });
      expect(readSessionSport(generateFit(makeActivity({ type: 'VirtualRide' }), streams))).toEqual({ sport: 2, subSport: 58 });
      expect(readSessionSport(generateFit(makeActivity({ type: 'Workout' }), streams))).toEqual({ sport: 0, subSport: 0 });
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
