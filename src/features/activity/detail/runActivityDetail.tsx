import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { buttonClass } from "../../../theme/components";
/**
 * 활동 상세의 러닝 전용 조각 — 훅 + 인트로(기록 배너 + 해석 요약).
 *
 * ActivityPage 가 품질 예산(파일 1600줄) 상한에 가까우므로 러닝 상태·JSX 를 여기로 분리한다.
 */
import type { Activity, UserProfile } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { RunPrTable } from "@shared/types/personal-records";
import RunRecordBanner from "../../../components/activity/RunRecordBanner";
import RunInterpretationCard from "../../../components/activity/RunInterpretationCard";
import { useRunBaselinePace } from "../../../hooks/useRunBaselinePace";
import { useRunRecords } from "../../../hooks/useRunRecords";
import type { InterpretationContext } from "../../../utils/metricInterpretation";
import { getSportCategory } from "./activityDetailUtils";

export interface RunActivityDetail {
  isRun: boolean;
  isOwner: boolean;
  /** 지표 해설(ⓘ)용 개인화 컨텍스트. 러닝이 아니면 undefined. */
  interpretationContext: InterpretationContext | undefined;
  runRecords: RunPrTable | undefined;
  baselinePaceSecPerKm: number | null;
  averageSpeedKmh: number;
}

/**
 * 러닝 활동에서만 구독·계산한다. 임계 페이스가 없으면 해석 단락은 자동 생략(§3.2).
 */
export function useRunActivityDetail(
  activity: Activity | null,
  profile: UserProfile | null | undefined,
  metrics?: Pick<ActivityMetrics, "avgCadence" | "cadenceUnit"> & Partial<Pick<ActivityMetrics, "avgSpeedKph">> | null,
  viewerUid?: string | null,
): RunActivityDetail {
  const isRun = getSportCategory(activity?.type) === "run";
  // `isRun` 게이트가 두 가지를 동시에 막는다: 자전거·수영 상세의 불필요한 100문서 읽기,
  // 그리고 활동 로딩 전(id=undefined)·후(id) 두 번 실행되던 중복 쿼리.
  const isOwner = !!viewerUid && activity?.userId === viewerUid;
  const personal = isRun && isOwner;
  const baseline = useRunBaselinePace(activity?.id, personal, activity?.startTime);
  const { run: runRecords } = useRunRecords(personal);

  const s = activity?.summary;
  const speed = metrics ? metrics.avgSpeedKph ?? 0 : s?.averageSpeed ?? 0;
  return {
    isRun,
    isOwner,
    runRecords: personal ? runRecords : undefined,
    baselinePaceSecPerKm: personal && !baseline.loading ? baseline.paceSecPerKm : null,
    averageSpeedKmh: speed,
    interpretationContext: personal && s
      ? {
          paceSecPerKm: speed > 0 ? Math.round(3600 / speed) : null,
          baselinePaceSecPerKm: baseline.loading ? null : baseline.paceSecPerKm,
          cadenceSpm: null,
          rtss: null,
          thresholdPaceSecPerKm: profile?.thresholdPace ?? null,
        }
      : undefined,
  };
}

/**
 * 러닝 활동 상세 상단 — 기록 갱신 축하를 먼저, 그다음 쉬운 말 해석 요약(§1 이중 레이어).
 * 러닝이 아니면 아무것도 렌더하지 않는다.
 */
export function RunActivityIntro({
  detail,
  activityId,
  gapSecPerKm,
}: {
  detail: RunActivityDetail;
  activityId: string | undefined;
  /** 서버 GAP 평균(초/km). 웹은 스트림에서 다시 계산하지 않는다. */
  gapSecPerKm: number | null;
}) {
  const { t } = useTranslation("activity");
  if (!detail.isRun || !(detail.averageSpeedKmh > 0 || (gapSecPerKm != null && gapSecPerKm > 0))) return null;
  return (
    <>
      {detail.isOwner && activityId && <RunRecordBanner run={detail.runRecords} activityId={activityId} />}
      <RunInterpretationCard
        gapSecPerKm={gapSecPerKm}
        averageSpeedKmh={detail.averageSpeedKmh}
        baselinePaceSecPerKm={detail.baselinePaceSecPerKm}
      />
      {detail.isOwner && (
        <div className="flex flex-wrap gap-2" data-testid="run-next-actions">
          <LocalizedLink to={{ pathname: "/plan", search: "?sport=run" }} className={buttonClass({ variant: "primary", size: "sm" })}>
            {t("analysis.run.nextTraining")}
          </LocalizedLink>
          <LocalizedLink to={{ pathname: "/fitness", search: "?sport=run" }} className={buttonClass({ variant: "ghost", size: "sm" })}>
            {t("analysis.run.trainingFlow")}
          </LocalizedLink>
        </div>
      )}
    </>
  );
}
