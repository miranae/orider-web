/**
 * 기록 갱신 배너 (설계 문서 §3.4a, 시안 6) — 활동 상세 상단.
 *
 * "🎉 5km 최고 기록! 26'40" — 41초 단축". 서버 확정 기록(`records/power`.run)에서 이 활동이
 * 현행 최고인 거리만 표시한다. 클라이언트 근사 판정이 없으므로 나중에 값이 바뀌지 않는다.
 *
 * 여러 거리에서 동시에 기록을 세우면 가장 긴 거리 하나만 배너로(가장 인상적인 성취). 나머지는
 * 기록 보드에서 NEW 로 확인한다.
 */
import { useTranslation } from "react-i18next";
import { buildOriderSharePayload, shareOrCopy } from "../../features/share/oriderShareText";
import { PartyPopper, Share2 } from "lucide-react";
import { Card, Text } from "../../theme/components";
import { useToast } from "../../contexts/ToastContext";
import { track } from "../../services/analytics";
import { logClientError } from "../../services/errorLogger";
import { newRecordsForActivity } from "../../utils/runRecords";
import { buildRecordShareText } from "../../utils/recordShare";
import { RUN_DISTANCE_M, type RunPrTable } from "@shared/types/personal-records";

export interface RunRecordBannerProps {
  run: RunPrTable | undefined;
  activityId: string;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}'${ss}"` : `${m}'${ss}"`;
}

export default function RunRecordBanner({ run, activityId }: RunRecordBannerProps) {
  const { t, i18n } = useTranslation("activity");
  const { showToast } = useToast();
  const news = newRecordsForActivity(run, activityId);
  if (news.length === 0) return null;

  // 가장 긴 거리 = 가장 인상적인 성취.
  const top = news.reduce((a, b) => (RUN_DISTANCE_M[b.distance] > RUN_DISTANCE_M[a.distance] ? b : a));

  // 기록 공유 — aha 를 획득 루프로 (§3.4a R4). navigator.share(카카오톡 포함 네이티브 시트)
  // + 클립보드 폴백. 이 저장소 관례(CoursePage.handleShare)와 동일.
  const handleShare = async () => {
    const distanceLabel = t(`runRecord.dist.${top.distance}`);
    const text = buildRecordShareText({ distanceLabel, timeSec: top.timeSec, improvedBySec: top.improvedBySec, t });
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
      <PartyPopper size={22} aria-hidden="true" style={{ color: "var(--accent)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text as="div" variant="bodySmall" tone="primary" weight={700}>
          {t("runRecord.title", { dist: t(`runRecord.dist.${top.distance}`), time: formatDuration(top.timeSec) })}
        </Text>
        <Text as="div" variant="caption" tone="secondary">
          {top.improvedBySec == null
            ? t("runRecord.first")
            : top.improvedBySec > 0
              ? t("runRecord.improved", { sec: top.improvedBySec })
              : t("runRecord.improvedTiny")}
          {news.length > 1 && ` · ${t("runRecord.more", { count: news.length - 1 })}`}
        </Text>
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
