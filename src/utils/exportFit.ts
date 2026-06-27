import type { Activity, ActivityStreams } from "@shared/types";
import { makeRelSecAt } from "./streamTime";

/** FIT 파일 바이너리 생성 */
export function generateFit(activity: Activity, streams: ActivityStreams): Uint8Array {
  const buf = new FitWriter();
  const startDate = new Date(activity.startTime);
  const garminEpoch = new Date("1989-12-31T00:00:00Z").getTime();
  const startTimestamp = Math.floor((startDate.getTime() - garminEpoch) / 1000);
  const len = streams.time?.length || streams.latlng?.length || 0;
  const durationMs = activity.summary.ridingTimeMillis || 0;
  const distanceM = activity.summary.distance || 0;
  // streams.time 단위 정규화(상대 초) — 절대 epoch 입력 시 startTimestamp + t 가 uint32 를
  // 넘겨 FIT 타임스탬프가 손상되던 버그 방지(TCX/GPX 와 동일 수정).
  const relSecAt = makeRelSecAt(streams.time);
  const endRel = relSecAt(len - 1);
  const endTimestamp = startTimestamp + Math.round(endRel ?? Math.floor(durationMs / 1000));

  // File ID 메시지 (mesg 0)
  buf.writeDefinition(0, 0, [
    [0, 1, 0],   // type: enum (4 = activity)
    [1, 2, 132], // manufacturer: uint16
    [2, 2, 132], // product: uint16
    [3, 4, 140], // serial_number: uint32z
    [4, 4, 134], // time_created: uint32
  ]);
  buf.writeData(0, [
    4,           // type: activity
    1, 0,        // manufacturer: Garmin (LE)
    0, 0,        // product
    0, 0, 0, 0,  // serial_number
    ...uint32LE(startTimestamp),
  ]);

  // Record 메시지 (mesg 20) — 각 트랙포인트
  const hasLatLng = !!streams.latlng?.length;
  const hasAlt = !!streams.altitude?.length;
  const hasHr = !!streams.heartrate?.length;
  const hasCad = !!streams.cadence?.length;
  const hasPower = !!streams.watts?.length;
  const hasSpeed = !!streams.velocity_smooth?.length;

  const recordFields: [number, number, number][] = [
    [253, 4, 134], // timestamp: uint32
  ];
  if (hasLatLng) {
    recordFields.push([0, 4, 133]); // position_lat: sint32
    recordFields.push([1, 4, 133]); // position_long: sint32
  }
  if (hasAlt) recordFields.push([2, 2, 132]); // altitude: uint16 (scale 5, offset 500)
  if (hasHr) recordFields.push([3, 1, 2]);     // heart_rate: uint8
  if (hasCad) recordFields.push([4, 1, 2]);    // cadence: uint8
  if (hasPower) recordFields.push([7, 2, 132]); // power: uint16
  if (hasSpeed) recordFields.push([6, 2, 132]); // speed: uint16 (scale 1000)

  buf.writeDefinition(0, 20, recordFields);

  for (let i = 0; i < len; i++) {
    const recBytes: number[] = [];
    const relSec = relSecAt(i) ?? i; // null(샘플 누락) → 인덱스를 초로 근사
    recBytes.push(...uint32LE(startTimestamp + Math.round(relSec)));

    if (hasLatLng) {
      const ll = streams.latlng![i];
      if (ll) {
        recBytes.push(...sint32LE(degreesToSemicircles(ll[0])));
        recBytes.push(...sint32LE(degreesToSemicircles(ll[1])));
      } else {
        recBytes.push(...sint32LE(0x7FFFFFFF)); // invalid
        recBytes.push(...sint32LE(0x7FFFFFFF));
      }
    }
    if (hasAlt) {
      const alt = streams.altitude![i] ?? 0;
      const encoded = Math.round((alt + 500) * 5);
      recBytes.push(...uint16LE(encoded));
    }
    if (hasHr) recBytes.push(streams.heartrate![i] ?? 0xFF);
    if (hasCad) recBytes.push(streams.cadence![i] ?? 0xFF);
    if (hasPower) recBytes.push(...uint16LE(streams.watts![i] ?? 0xFFFF));
    if (hasSpeed) {
      const speedMs = (streams.velocity_smooth![i] ?? 0) / 3.6; // km/h → m/s
      recBytes.push(...uint16LE(Math.round(speedMs * 1000)));
    }

    buf.writeData(0, recBytes);
  }

  // Session 메시지 (mesg 18) — 요약
  buf.writeDefinition(0, 18, [
    [253, 4, 134], // timestamp
    [2, 4, 134],   // start_time: uint32
    [7, 4, 134],   // total_elapsed_time: uint32 (scale 1000)
    [8, 4, 134],   // total_timer_time: uint32 (scale 1000)
    [9, 4, 134],   // total_distance: uint32 (scale 100, meters)
    [5, 1, 0],     // sport: enum
    [6, 1, 0],     // sub_sport: enum
  ]);
  buf.writeData(0, [
    ...uint32LE(endTimestamp),
    ...uint32LE(startTimestamp),
    ...uint32LE(Math.round(durationMs)),   // total_elapsed_time
    ...uint32LE(Math.round(durationMs)),   // total_timer_time
    ...uint32LE(Math.round(distanceM * 100)), // total_distance (cm)
    2, // sport: cycling
    0, // sub_sport: generic
  ]);

  // Lap 메시지 (mesg 19) — 최소 1개 필수
  buf.writeDefinition(0, 19, [
    [253, 4, 134], // timestamp: uint32
    [2, 4, 134],   // start_time: uint32
    [7, 4, 134],   // total_elapsed_time: uint32 (scale 1000)
    [8, 4, 134],   // total_timer_time: uint32 (scale 1000)
    [9, 4, 134],   // total_distance: uint32 (scale 100)
    [0, 1, 0],     // event: enum
    [1, 1, 0],     // event_type: enum
    [24, 1, 0],    // lap_trigger: enum
  ]);
  buf.writeData(0, [
    ...uint32LE(endTimestamp),
    ...uint32LE(startTimestamp),
    ...uint32LE(Math.round(durationMs)),
    ...uint32LE(Math.round(durationMs)),
    ...uint32LE(Math.round(distanceM * 100)),
    9,  // event: lap
    1,  // event_type: stop
    0,  // lap_trigger: manual
  ]);

  // Activity 메시지 (mesg 34) — FIT Profile 기준 필드 번호
  buf.writeDefinition(0, 34, [
    [253, 4, 134], // timestamp: uint32
    [0, 4, 134],   // total_timer_time: uint32 (scale 1000)
    [5, 4, 134],   // local_timestamp: uint32
    [1, 2, 132],   // num_sessions: uint16
    [3, 1, 0],     // event: enum
    [4, 1, 0],     // event_type: enum
  ]);
  buf.writeData(0, [
    ...uint32LE(endTimestamp),
    ...uint32LE(Math.round(durationMs)),
    ...uint32LE(endTimestamp),
    ...uint16LE(1), // 1 session
    26, // event: activity
    1,  // event_type: stop
  ]);

  return buf.finish();
}

// --- FIT 바이너리 헬퍼 ---

/** 위도/경도를 semicircles로 변환 */
export function degreesToSemicircles(deg: number): number {
  return Math.round(deg * (2 ** 31 / 180));
}

function uint16LE(v: number): number[] {
  return [v & 0xFF, (v >> 8) & 0xFF];
}

function uint32LE(v: number): number[] {
  return [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF];
}

function sint32LE(v: number): number[] {
  if (v < 0) v = 0x100000000 + v;
  return uint32LE(v);
}

/**
 * Garmin FIT SDK CRC16 (nibble lookup table)
 * Reference: FIT SDK fit_crc.c — FitCRC_Get16
 */
export function crc16(data: Uint8Array): number {
  const table: number[] = [
    0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
    0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
  ];
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    const b = data[i]!;
    // lower nibble
    let tmp = table[crc & 0xF]!;
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ table[b & 0xF]!;
    // upper nibble
    tmp = table[crc & 0xF]!;
    crc = (crc >> 4) & 0x0FFF;
    crc = crc ^ tmp ^ table[(b >> 4) & 0xF]!;
  }
  return crc;
}

class FitWriter {
  private bytes: number[] = [];

  writeDefinition(localMesg: number, globalMesg: number, fields: [number, number, number][]) {
    this.bytes.push(0x40 | (localMesg & 0x0F));
    this.bytes.push(0); // reserved
    this.bytes.push(0); // architecture: little-endian
    this.bytes.push(...uint16LE(globalMesg));
    this.bytes.push(fields.length);
    for (const [num, size, baseType] of fields) {
      this.bytes.push(num, size, baseType);
    }
  }

  writeData(localMesg: number, data: number[]) {
    this.bytes.push(localMesg & 0x0F);
    this.bytes.push(...data);
  }

  finish(): Uint8Array {
    const dataSize = this.bytes.length;
    const header = new Uint8Array(14);
    header[0] = 14;
    header[1] = 20;           // protocol version 2.0
    header[2] = 0x08;         // profile version low
    header[3] = 0x08;         // profile version high
    header[4] = dataSize & 0xFF;
    header[5] = (dataSize >> 8) & 0xFF;
    header[6] = (dataSize >> 16) & 0xFF;
    header[7] = (dataSize >> 24) & 0xFF;
    header[8] = 0x2E; // '.'
    header[9] = 0x46; // 'F'
    header[10] = 0x49; // 'I'
    header[11] = 0x54; // 'T'
    const headerCrc = crc16(header.subarray(0, 12));
    header[12] = headerCrc & 0xFF;
    header[13] = (headerCrc >> 8) & 0xFF;

    const dataBytes = new Uint8Array(this.bytes);
    const dataCrc = crc16(dataBytes);

    const result = new Uint8Array(14 + dataSize + 2);
    result.set(header, 0);
    result.set(dataBytes, 14);
    result[14 + dataSize] = dataCrc & 0xFF;
    result[14 + dataSize + 1] = (dataCrc >> 8) & 0xFF;

    return result;
  }
}
