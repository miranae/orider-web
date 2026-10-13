/** 현재 저장된 러닝 최고 기록의 근거 활동을 표시한다. 성과의 시간 순서는 추정하지 않는다. */
import { useTranslation } from "react-i18next";
import { buildOriderSharePayload, shareOrCopy } from "../../features/share/oriderShareText";
import { Trophy, Share2 } from "lucide-react";
import { Card, Text } from "../../theme/components";
import { useToast } from "../../contexts/ToastContext";
import { track } from "../../services/analytics";
import { logClientError } from "../../services/errorLogger";
import { storedBestRecordsForActivity } from "../../utils/runRecords";
import { formatRecordDuration } from "../../utils/recordShare";
import { LocalizedLink } from "../LocalizedLink";
import { RUN_DISTANCE_M, type RunPrTable } from "@shared/types/personal-records";

export interface RunRecordBannerProps {
  run: RunPrTable | undefined;
  activityId: string;
}

export default function RunRecordBanner({ run, activityId }: RunRecordBannerProps) {
  const { t, i18n } = useTranslation("activity");
  const { showToast } = useToast();
  const news = storedBestRecordsForActivity(run, activityId);
  if (news.length === 0) return null;

  // 가장 긴 거리 = 가장 인상적인 성취.
  const top = news.reduce((a, b) => (RUN_DISTANCE_M[b.distance] > RUN_DISTANCE_M[a.distance] ? b : a));

  // 기록 공유 — aha 를 획득 루프로 (§3.4a R4). navigator.share(카카오톡 포함 네이티브 시트)
  // + 클립보드 폴백. 이 저장소 관례(CoursePage.handleShare)와 동일.
  const handleShare = async () => {
    const distanceLabel = t(`runRecord.dist.${top.distance}`);
    const text = t("runRecord.share.stored", { dist: distanceLabel, time: formatRecordDuration(top.timeSec) });
    const url = window.location.href;
    const payload = buildOriderSharePayload({ title: t("runRecord.share.appName"), body: text, url, language: i18n.language });
    track("or_run_record_share", { distance: top.distance });
    const result = await shareOrCopy(payload);
    if (result === "copied") showToast(t("runRecord.share.copied"));
    else if (result === "failed") {
      logClientError("RunRecordBanner.share", new Error("Share unavailable or failed"), { distance: top.distance });
      showToast(t("runRecord.share.failed"));
    }
  };

  return (
    <Card
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        borderColor: "var(--accent-soft-border)",
        background: "var(--accent-soft-bg)",
      }}
    >
      <Trophy size={22} aria-hidden="true" style={{ color: "var(--accent)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text as="div" variant="bodySmall" tone="primary" weight={700}>
          {t(top.tied ? "runRecord.storedTieTitle" : "runRecord.storedTitle", { dist: t(`runRecord.dist.${top.distance}`), time: formatRecordDuration(top.timeSec) })}
        </Text>
        <Text as="div" variant="caption" tone="secondary">
          {t("runRecord.storedNote")}
          {news.length > 1 && ` · ${t("runRecord.storedMore", { count: news.length - 1 })}`}
        </Text>
        <LocalizedLink to={`/activity/${encodeURIComponent(activityId)}`} className="text-[length:var(--fs-sm)] text-[var(--accent)] underline">{t("runRecord.source")}</LocalizedLink>
      </div>
      <button
        type="button"
        onClick={handleShare}
        aria-label={t("runRecord.share.button")}
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-1)",
          minHeight: 36,
          padding: "0 var(--space-3)",
          background: "var(--bg-1)",
          border: "1px solid var(--accent-soft-border)",
          borderRadius: "var(--r-md)",
          color: "var(--accent)",
          fontSize: "var(--fs-xs)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Share2 size={14} aria-hidden="true" />
        {t("runRecord.share.button")}
      </button>
    </Card>
  );
}
