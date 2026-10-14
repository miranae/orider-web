import { useTranslation } from "react-i18next";
import type { RunEvidence } from "../multisportPerformance";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Card, Text } from "../../../theme/components";

function duration(seconds: number) {
  const value = Math.round(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = String(value % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}
/** 서버 원본 영수증이 있는 기록만 시간으로 표시한다. 구형 저장값을 PB로 인증하지 않는다. */
export default function RunRecordsSummary({ evidence }: { evidence: RunEvidence }) {
  const { t } = useTranslation("fitness");
  const qualified = evidence.records.filter(record => record.qualification === "source_qualified" && record.unit === "seconds"
    && Number.isFinite(record.seconds) && record.seconds > 0 && typeof record.activityId === "string" && record.activityId.trim() && Number.isFinite(record.startTime));
  return <Card data-testid="K5-4">
    {(["5km", "10km"] as const).map(distance => {
      const best = qualified.filter(record => record.distance === distance).sort((a, b) => a.seconds - b.seconds)[0];
      const legacy = evidence.unverifiedRecords?.some(record => record.distance === distance);
      return <Text data-testid="K5-4-1" as="p" key={distance}>{t(`runRecords.dist.${distance}`)} · {best ? `${duration(best.seconds)} · ${best.date}` : t(legacy ? "runRecords.unverifiedLabel" : "runRecords.none")}</Text>;
    })}
    <LocalizedLink data-testid="K5-4-2" to="/athlete/me/records?sport=run">{t("runRecords.viewAll")}</LocalizedLink>
  </Card>;
}
