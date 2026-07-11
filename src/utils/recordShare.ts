/**
 * 기록 공유 텍스트 빌더 (설계 문서 §3.4a R4) — 순수 함수.
 *
 * 공유 자체는 Web Share API(카카오톡 포함 네이티브 시트) + 클립보드 폴백으로,
 * 이 저장소의 확립된 관례(CoursePage.handleShare)를 따른다. 여기서는 문구만 만든다.
 */
import type { RunDistanceKey } from "@shared/types/personal-records";

/** 총 시간(초) → `26'40"` 또는 `2:08'55"`. */
export function formatRecordDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}'${ss}"` : `${m}'${ss}"`;
}

export interface RecordShareInput {
  /** 거리 라벨(현지화됨) — 예 "5km", "하프". */
  distanceLabel: string;
  timeSec: number;
  /** 직전 최고 대비 단축 초. 첫 기록이면 null. */
  improvedBySec: number | null;
  /** i18n 문구 조회 함수. */
  t: (key: string, opts?: Record<string, unknown>) => string;
}

/**
 * 공유 본문. 첫 기록/갱신에 따라 문구가 다르다.
 * URL 은 호출부가 붙인다(활동 상세 주소).
 */
export function buildRecordShareText(input: RecordShareInput): string {
  const time = formatRecordDuration(input.timeSec);
  if (input.improvedBySec != null && input.improvedBySec <= 0) {
    // 1초 미만 단축 — 초 수를 말하지 않는다.
    return input.t("runRecord.share.improvedTiny", { dist: input.distanceLabel, time });
  }
  return input.improvedBySec != null
    ? input.t("runRecord.share.improved", { dist: input.distanceLabel, time, sec: input.improvedBySec })
    : input.t("runRecord.share.first", { dist: input.distanceLabel, time });
}

/** 거리 키 → 공유 문구용 라벨은 호출부가 i18n 으로 준다. 여기선 정렬/식별만. */
export type ShareDistance = RunDistanceKey;
