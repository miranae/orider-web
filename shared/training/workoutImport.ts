/**
 * 구조화 워크아웃 파일 임포트 (#476) — Zwift `.zwo` / ERG `.erg` / MRC `.mrc`.
 *
 * 외부 트레이너 워크아웃을 Orider 플랜의 IntervalBlock[] 로 변환한다.
 *  - `.zwo` : XML. Power 는 FTP 분율(0.88 = 88%FTP). Warmup/Cooldown/Ramp 는 구간 ramp.
 *  - `.erg` : 텍스트. [COURSE DATA] 의 (분, 와트) breakpoint. 헤더 FTP= 로 %FTP 환산.
 *  - `.mrc` : `.erg` 와 동일 포맷이나 값이 이미 %FTP.
 *
 * 정규화 중간표현(ParsedWorkout)은 모든 파워를 **FTP 분율**로 통일한다. FTP(watts)는
 * 임포트 시점(플랜의 snapshot.ftp)에 toIntervalBlocks 로 watts 로 환산한다.
 * 순수 함수 · DOM/Node 의존 없음(.zwo 도 정규식 파싱 — shared 안전).
 */
import type { IntervalBlock } from "../types/goal";

export type WorkoutSource = "zwo" | "erg" | "mrc";

/** 정규화 스텝 — 파워는 FTP 분율(1.0 = 100%FTP). ramp 면 low≠high. free 면 둘 다 null. */
export interface ParsedStep {
  durationSec: number;
  /** 시작 파워(FTP 분율). FreeRide 등 무타깃이면 null. */
  powerLow: number | null;
  /** 종료 파워(FTP 분율). steady 면 powerLow 와 동일. */
  powerHigh: number | null;
  /** 워밍업/쿨다운 힌트(라벨 결정용). */
  kind?: "warmup" | "cooldown" | "free";
}

export interface ParsedWorkout {
  source: WorkoutSource;
  name: string | null;
  description: string | null;
  steps: ParsedStep[];
}

const num = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1];

/** .zwo XML → ParsedWorkout. 정규식 기반(요소가 평탄한 self-closing 목록). */
export function parseZwo(xml: string): ParsedWorkout {
  const name = /<name>([\s\S]*?)<\/name>/i.exec(xml)?.[1]?.trim() || null;
  const description = /<description>([\s\S]*?)<\/description>/i.exec(xml)?.[1]?.trim() || null;
  const workoutBlock = /<workout>([\s\S]*?)<\/workout>/i.exec(xml)?.[1] ?? "";

  const steps: ParsedStep[] = [];
  // 각 워크아웃 요소(self-closing 또는 open) 매칭.
  const elemRe = /<(Warmup|Cooldown|SteadyState|Ramp|IntervalsT|FreeRide|MaxEffort)\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = elemRe.exec(workoutBlock)) !== null) {
    const type = m[1]!.toLowerCase();
    const a = m[2] ?? "";
    const dur = num(attr(a, "Duration"));
    if (type === "intervalst") {
      const repeat = Math.max(1, Math.round(num(attr(a, "Repeat")) ?? 1));
      const onDur = num(attr(a, "OnDuration")) ?? 0;
      const offDur = num(attr(a, "OffDuration")) ?? 0;
      const onPow = num(attr(a, "OnPower")) ?? num(attr(a, "PowerOnHigh"));
      const offPow = num(attr(a, "OffPower")) ?? num(attr(a, "PowerOffHigh"));
      for (let i = 0; i < repeat; i++) {
        if (onDur > 0) steps.push({ durationSec: onDur, powerLow: onPow, powerHigh: onPow });
        // off 구간은 실제 회복 파워(offPow)를 가지므로 free 가 아니라 해당 파워 존으로 라벨링.
        if (offDur > 0) steps.push({ durationSec: offDur, powerLow: offPow, powerHigh: offPow });
      }
    } else if (type === "freeride") {
      if (dur && dur > 0) steps.push({ durationSec: dur, powerLow: null, powerHigh: null, kind: "free" });
    } else {
      if (!dur || dur <= 0) continue;
      const single = num(attr(a, "Power"));
      const low = num(attr(a, "PowerLow")) ?? single;
      const high = num(attr(a, "PowerHigh")) ?? single;
      const kind = type === "warmup" ? "warmup" : type === "cooldown" ? "cooldown" : undefined;
      steps.push({ durationSec: dur, powerLow: low, powerHigh: high, kind });
    }
  }
  return { source: "zwo", name, description, steps };
}

/** .erg / .mrc 텍스트 → ParsedWorkout. `.erg` 는 watts(헤더 FTP 로 환산), `.mrc` 는 %FTP. */
export function parseErgMrc(text: string, source: "erg" | "mrc"): ParsedWorkout {
  const lines = text.split(/\r?\n/);
  let name: string | null = null;
  let ftp: number | null = null;
  const data: Array<[number, number]> = []; // [minutes, value]
  let inData = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith("[COURSE DATA]")) { inData = true; continue; }
    if (upper.startsWith("[END COURSE DATA]")) { inData = false; continue; }
    if (!inData) {
      const desc = /^(?:DESCRIPTION|FILE NAME)\s*=\s*(.+)$/i.exec(line);
      if (desc && !name) name = desc[1]!.trim();
      const f = /^FTP\s*=\s*([\d.]+)/i.exec(line);
      if (f) ftp = num(f[1]);
      continue;
    }
    const parts = line.split(/\s+/);
    const t = num(parts[0]);
    const v = num(parts[1]);
    if (t != null && v != null) data.push([t, v]);
  }

  // breakpoint 쌍 → 스텝. value 를 FTP 분율로 환산.
  const toPct = (v: number): number =>
    source === "mrc" ? v / 100 : ftp && ftp > 0 ? v / ftp : v / 200; // erg watts/ftp (FTP 미상 시 200 가정)
  const steps: ParsedStep[] = [];
  for (let i = 0; i < data.length - 1; i++) {
    const [t0, v0] = data[i]!;
    const [t1, v1] = data[i + 1]!;
    const durationSec = Math.round((t1 - t0) * 60);
    if (durationSec <= 0) continue;
    steps.push({ durationSec, powerLow: toPct(v0), powerHigh: toPct(v1) });
  }
  return { source, name, description: null, steps };
}

/** 확장자 + 내용으로 파서 분기. 인식 불가/스텝 0 이면 null. */
export function parseWorkoutFile(filename: string, content: string): ParsedWorkout | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  let parsed: ParsedWorkout | null = null;
  if (ext === "zwo" || /<workout_file|<workout>/i.test(content)) parsed = parseZwo(content);
  else if (ext === "erg") parsed = parseErgMrc(content, "erg");
  else if (ext === "mrc") parsed = parseErgMrc(content, "mrc");
  if (!parsed || parsed.steps.length === 0) return null;
  return parsed;
}

/** FTP 분율 → IntervalBlock.label 존 매핑. */
function zoneLabel(pct: number | null, kind?: ParsedStep["kind"]): IntervalBlock["label"] {
  if (kind === "warmup") return "WU";
  if (kind === "cooldown") return "CD";
  if (pct == null || kind === "free") return "R";
  if (pct < 0.55) return "Z1";
  if (pct < 0.75) return "Z2";
  if (pct < 0.90) return "Z3";
  if (pct < 1.05) return "Z4";
  return "Z5";
}

/**
 * ParsedWorkout → IntervalBlock[] (모델 저장형). FTP(watts)로 파워 분율을 watts 로 환산.
 * 인접 동일-라벨·동일-파워 스텝은 합치지 않고 원형 보존(인터벌 반복 표현 유지).
 */
export function toIntervalBlocks(parsed: ParsedWorkout, ftpW: number): IntervalBlock[] {
  return parsed.steps.map((s) => {
    const block: IntervalBlock = {
      label: zoneLabel(s.powerHigh ?? s.powerLow, s.kind),
      durationMin: Math.round((s.durationSec / 60) * 10) / 10,
    };
    if (s.powerLow != null && s.powerHigh != null && ftpW > 0) {
      const lo = Math.round(Math.min(s.powerLow, s.powerHigh) * ftpW);
      const hi = Math.round(Math.max(s.powerLow, s.powerHigh) * ftpW);
      block.targetPowerW = [lo, hi];
    }
    return block;
  });
}

export interface WorkoutLoad {
  totalSec: number;
  durationMin: number;
  /** 추정 IF (intensity factor, NP/FTP 근사). */
  intensityFactor: number;
  /** 추정 TSS = (sec/3600)·IF²·100. */
  tss: number;
}

/**
 * 구조화 워크아웃의 부하 추정 — 플랜의 plannedDurationMin/plannedTSS 채움용.
 * IF 는 스텝 평균파워의 4제곱평균(NP 근사)/FTP. free 스텝은 0.5 로 가정.
 */
export function estimateWorkoutLoad(parsed: ParsedWorkout): WorkoutLoad {
  let totalSec = 0;
  let weighted4 = 0;
  for (const s of parsed.steps) {
    const mid = s.powerLow != null && s.powerHigh != null
      ? (s.powerLow + s.powerHigh) / 2
      : 0.5; // free/무타깃
    totalSec += s.durationSec;
    weighted4 += Math.pow(mid, 4) * s.durationSec;
  }
  const intensityFactor = totalSec > 0 ? Math.pow(weighted4 / totalSec, 0.25) : 0;
  const tss = Math.round((totalSec / 3600) * intensityFactor * intensityFactor * 100);
  return {
    totalSec,
    durationMin: Math.round(totalSec / 60),
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    tss,
  };
}
