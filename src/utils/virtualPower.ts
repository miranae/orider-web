export interface VirtualPowerParams {
  riderWeightKg: number;
  bikeWeightKg: number;
  rollingResistance: number;
  cdA: number;
}

export interface PowerStreamInput {
  time: number[];
  velocity_smooth: number[];
  altitude: number[];
}

const G = 9.81;
const RHO_SEA = 1.225;
const EFFICIENCY = 0.97;
const MAX_ACCEL = 5;
// GPS 속도 아웃라이어가 cubic aero 항(v³)을 폭주시켜 순간 수천 W 스파이크를 만든다
// (NP/TSS/xPower 까지 오염). 자전거 현실 상한으로 속도와 최종 파워를 클램프.
// CF 미러(functions/src/lib/virtualPower.ts)와 동일해야 함 — 한쪽 수정 시 양쪽.
const V_MAX = 25;        // m/s ≈ 90 km/h — 이보다 큰 순간속도는 GPS 노이즈로 간주
const MAX_WATTS = 2000;  // 모델 파워 물리적 상한 (실제 스프린트도 ~2000W 수준)

function smooth7(arr: number[]): number[] {
  const n = arr.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let cnt = 0;
    for (let k = -3; k <= 3; k++) {
      const j = i + k;
      if (j >= 0 && j < n) {
        sum += arr[j]!;
        cnt++;
      }
    }
    out[i] = sum / cnt;
  }
  return out;
}

/**
 * time 배열을 "초 단위 elapsed time" 으로 정규화.
 * Strava: seconds since start (0,1,2,...) — 그대로.
 * Orider 모바일: Unix ms timestamp — /1000 + 시작점 차감.
 *
 * 정규화 안 하면 dt = 1000(ms 1초) → validDt 체크 실패 → ds default 0.1m →
 * gradient 폭주(25% clamp) → pClimb 30배 → TSS 폭주.
 *
 * Cloud Functions 미러: functions/src/lib/virtualPower.ts — 변경 시 함께 수정.
 */
export function normalizeTimeToSeconds(time: number[]): number[] {
  if (time.length === 0) return time;
  const first = time[0]!;
  if (first > 1e10) {
    return time.map((v) => (v - first) / 1000);
  }
  if (time.length >= 2) {
    const sampleDeltas: number[] = [];
    for (let i = 1; i < Math.min(time.length, 50); i++) {
      const d = time[i]! - time[i - 1]!;
      if (d > 0) sampleDeltas.push(d);
    }
    if (sampleDeltas.length > 0) {
      sampleDeltas.sort((a, b) => a - b);
      const median = sampleDeltas[Math.floor(sampleDeltas.length / 2)]!;
      if (median > 100) {
        return time.map((v) => (v - first) / 1000);
      }
    }
  }
  return time;
}

export function calcVirtualPowerStream(
  input: PowerStreamInput,
  params: VirtualPowerParams,
): number[] {
  const n = input.time.length;
  if (n === 0) return [];
  if (input.velocity_smooth.length !== n || input.altitude.length !== n) return [];

  const v = smooth7(input.velocity_smooth);
  const alt = smooth7(input.altitude);
  // ms timestamp → seconds 자동 변환 (orider 모바일 활동 단위 버그 보정)
  const t = normalizeTimeToSeconds(input.time);

  const M = params.riderWeightKg + params.bikeWeightKg;
  const watts = new Array<number>(n).fill(0);

  for (let i = 1; i < n; i++) {
    const vi = v[i]!;
    if (vi <= 0) continue;
    const dt = t[i]! - t[i - 1]!;
    const validDt = dt >= 0.1 && dt <= 10;

    const ds = Math.max(((vi + v[i - 1]!) / 2) * (validDt ? dt : 0), 0.1);
    // GPS/기압 노이즈로 인한 gradient 폭주 방지: 자전거 주행 가능 범위로 클램프
    const gradientRaw = (alt[i]! - alt[i - 1]!) / ds;
    const gradient = Math.max(-0.25, Math.min(0.25, gradientRaw));
    const rho = Math.max(0.4, RHO_SEA * Math.pow(Math.max(0, 1 - (0.0065 * alt[i]!) / 288.15), 5.255));

    // aero 는 v³ 이라 속도 아웃라이어에 극히 민감 → V_MAX 로 캡한 속도로 계산.
    const vAero = Math.min(vi, V_MAX);
    const pRoll = params.rollingResistance * M * G * vi;
    const pAero = 0.5 * rho * params.cdA * vAero * vAero * vAero;
    const pClimb = M * G * gradient * vi;

    let pAccel = 0;
    if (validDt) {
      const a = (vi - v[i - 1]!) / dt;
      if (Math.abs(a) <= MAX_ACCEL) {
        pAccel = M * a * ((vi + v[i - 1]!) / 2);
      }
    }

    const total = (pRoll + pAero + pClimb + pAccel) / EFFICIENCY;
    watts[i] = Math.min(MAX_WATTS, Math.max(0, Math.round(total)));
  }

  return watts;
}
