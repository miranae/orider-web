import type { Activity } from "@shared/types";
import { disciplineOfType } from "@shared/sport/discipline";

/**
 * 활동 `type`(Strava `sport_type`) → 내보내기 파일(FIT/TCX/GPX)의 종목 표기.
 *
 * 내보내기는 종목을 사이클로 고정해 러닝·걷기·수영도 FIT `cycling`, TCX `Biking` 으로
 * 기록했고 GPX 에는 종목이 없었다. 그래서 내보낸 러닝 파일을 다시 가져오면 라이딩으로
 * 분류됐다. 종목 축 판정은 `disciplineOfType` 정본을 따르고, 그 축이 묶는 걷기·하이킹은
 * 파일 규격에 별도 값이 있으므로 여기서 구분한다.
 *
 * 값은 서버 파일 임포트의 종목 힌트 해석이 같은 종목으로 되읽는 표기를 쓴다
 * (FIT `session.sport`·`sub_sport`, TCX `@Sport`, GPX `trk/type`).
 */
export interface ExportSport {
  /** FIT Profile `sport` enum. */
  fitSport: number;
  /** FIT Profile `sub_sport` enum. */
  fitSubSport: number;
  /** TCX `Activity/@Sport` — 스키마상 `Running` | `Biking` | `Other` 세 값뿐이다. */
  tcxSport: "Running" | "Biking" | "Other";
  /** GPX `trk/type`. 추적 종목이 아니면 `null` — 요소를 생략한다. */
  gpxType: string | null;
  /** 설명이 없을 때 트랙 이름·파일 이름에 쓰는 종목 이름. */
  label: string;
  /** 발로 움직이는 종목 — 파일의 케이던스가 한 발 기준(strides/min)이다. */
  footCadence: boolean;
}

// FIT SDK Profile 의 enum 값.
const FIT_SPORT = { generic: 0, running: 1, cycling: 2, swimming: 5, walking: 11, hiking: 17 } as const;
const FIT_SUB_SPORT = { generic: 0, trail: 3, virtualActivity: 58 } as const;

export function exportSportOf(activity: Pick<Activity, "type">): ExportSport {
  const type = typeof activity.type === "string" ? activity.type.trim().toLowerCase() : "";
  // 걷기·하이킹은 종목 축으로는 러닝이지만 FIT·GPX 에는 고유 값이 있다.
  if (type === "walk") {
    return { fitSport: FIT_SPORT.walking, fitSubSport: FIT_SUB_SPORT.generic, tcxSport: "Other", gpxType: "walking", label: "Walk", footCadence: true };
  }
  if (type === "hike") {
    return { fitSport: FIT_SPORT.hiking, fitSubSport: FIT_SUB_SPORT.generic, tcxSport: "Other", gpxType: "hiking", label: "Hike", footCadence: true };
  }
  switch (disciplineOfType(type === "indoor_cycling" ? "VirtualRide" : activity.type)) {
    case "run": {
      const fitSubSport = type === "trailrun" ? FIT_SUB_SPORT.trail
        : type === "virtualrun" ? FIT_SUB_SPORT.virtualActivity : FIT_SUB_SPORT.generic;
      return { fitSport: FIT_SPORT.running, fitSubSport, tcxSport: "Running", gpxType: "running", label: "Run", footCadence: true };
    }
    case "bike":
      return {
        fitSport: FIT_SPORT.cycling,
        // 서버 임포트는 cycling + virtual_activity 를 VirtualRide 로 되읽는다.
        fitSubSport: (type === "virtualride" || type === "indoor_cycling") ? FIT_SUB_SPORT.virtualActivity : FIT_SUB_SPORT.generic,
        tcxSport: "Biking",
        gpxType: "cycling",
        label: "Ride",
        footCadence: false,
      };
    case "swim":
      return { fitSport: FIT_SPORT.swimming, fitSubSport: FIT_SUB_SPORT.generic, tcxSport: "Other", gpxType: "swimming", label: "Swim", footCadence: false };
    default:
      // 추적 종목이 아니면 사이클로 떨어뜨리지 않는다(`disciplineOfType` 계약).
      return { fitSport: FIT_SPORT.generic, fitSubSport: FIT_SUB_SPORT.generic, tcxSport: "Other", gpxType: null, label: "Activity", footCadence: false };
  }
}

/** 내보내기 파일 이름 — `YYYYMMDD_<설명 또는 종목>.<ext>`. */
export function exportFilename(activity: Pick<Activity, "type" | "startTime" | "description">, ext: string): string {
  const dateStr = new Date(activity.startTime).toISOString().slice(0, 10).replace(/-/g, "");
  const name = (activity.description || exportSportOf(activity).label.toLowerCase())
    .replace(/[^a-zA-Z0-9가-힣]/g, "_").slice(0, 30);
  return `${dateStr}_${name}.${ext}`;
}
