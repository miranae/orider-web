import { describe, it, expect } from 'vitest';
import { generateCsv } from '../exportCsv';

describe('generateCsv', () => {
  it('generates CSV with headers and rows', () => {
    const streams = {
      userId: 'u1',
      time: [0, 1],
      latlng: [[37.5, 127.0], [37.501, 127.001]] as [number, number][],
      altitude: [100, 101],
      velocity_smooth: [25.0, 26.0],
      heartrate: [120, 125],
      watts: [200, 210],
      cadence: [80, 82],
    };
    const csv = generateCsv(streams);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('timestamp,latitude,longitude,altitude,speed,cadence,heartrate,power');
    expect(lines[1]).toBe('0,37.5,127,100,25,80,120,200');
    expect(lines.length).toBe(3);
  });

  it('normalizes absolute epoch-ms time to elapsed seconds (regression)', () => {
    const streams = {
      userId: 'u1',
      time: [1700000000000, 1700000001000], // 절대 ms, 1초 간격
      latlng: [[37.5, 127.0], [37.501, 127.001]] as [number, number][],
    };
    const csv = generateCsv(streams);
    const lines = csv.split('\n');
    // 상대초로 정규화 → 0, 1 (절대 ms 가 그대로 새지 않음)
    expect(lines[1]!.startsWith('0,')).toBe(true);
    expect(lines[2]!.startsWith('1,')).toBe(true);
  });

  it('handles missing optional data', () => {
    const streams = {
      userId: 'u1',
      time: [0],
      latlng: [[37.5, 127.0]] as [number, number][],
    };
    const csv = generateCsv(streams);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('0,37.5,127,,,,,' );
  });
});
