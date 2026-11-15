/** 현재 저장된 러닝 최고 기록의 근거 활동을 표시한다. 성과의 시간 순서는 추정하지 않는다. */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
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
import { ICON_SIZE } from "../../theme/tokens/icon";

export interface RunRecordBannerProps {
  run: RunPrTable | undefined;
  activityId: string;
}

export default function RunRecordBanner({ run, activityId }: RunRecordBannerProps) {
  const { t, i18n } = useTranslation("activity");
  const { showToast } = useToast();
  const { auth } = useFirebaseServices();
  // 전역 토스트의 재시도는 배너가 내려간 뒤에도 남는다 — 마운트 중일 때만 실행한다.
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const news = storedBestRecordsForActivity(run, activityId);
  if (news.length === 0) return null;

  // 가장 긴 거리 = 가장 인상적인 성취.
  const top = news.reduce((a, b) => (RUN_DISTANCE_M[b.distance] > RUN_DISTANCE_M[a.distance] ? b : a));

  // 기록 공유 — aha 를 획득 루프로 (§3.4a R4). navigator.share(카카오톡 포함 네이티브 시트)
  // + 클립보드 폴백. 이 저장소 관례(CoursePage.handleShare)와 동일.
  const handleShare = async () => {
    // 인증 주체는 공유를 시작할 때 잡는다 — 공유 도중 계정이 바뀌고 늦게 실패하면 새 계정 기준으로 재시도가 생기지 않게.
    const uid = auth.currentUser?.uid ?? null;
    const sameSession = () => mounted.current && (auth.currentUser?.uid ?? null) === uid;
    const distanceLabel = t(`runRecord.dist.${top.distance}`);
    const text = t("runRecord.share.stored", { dist: distanceLabel, time: formatRecordDuration(top.timeSec) });
    const url = window.location.href;
    const payload = buildOriderSharePayload({ title: t("runRecord.share.appName"), body: text, url, language: i18n.language });
    track("or_run_record_share", { distance: top.distance });
    const result = await shareOrCopy(payload);
    if (result === "copied") showToast(t("runRecord.share.copied"));
    else if (result === "failed") {
      logClientError("RunRecordBanner.share", new Error("Share unavailable or failed"), { distance: top.distance });
      // 알림 문구를 누르면 같은 공유를 다시 시도한다(누름 자체가 공유 시트에 필요한 사용자 동작).
      // 그사이 다른 화면으로 옮겼거나, 배너가 내려갔거나, 인증 주체가 바뀌었으면(로그아웃·계정 전환) 이전 계정의
      // 기록 문구를 공유하게 되므로 아무것도 하지 않는다.
      if (!sameSession()) return;
      showToast(t("runRecord.share.failed"), undefined, { resolve: { onClick: () => {
        if (sameSession() && window.location.href === url) void handleShare();
      } } });
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
      <Trophy size={ICON_SIZE.lg} aria-hidden="true" style={{ color: "var(--accent)", flexShrink: 0 }} />
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
        <Share2 size={ICON_SIZE.sm} aria-hidden="true" />
        {t("runRecord.share.button")}
      </button>
    </Card>
  );
}
