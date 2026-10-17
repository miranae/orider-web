import { useTranslation } from "react-i18next";
import { qualifiedRunRecords } from "../runAnalysisReadiness";
import type { RunEvidence } from "../multisportPerformance";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { buttonClass, Card, Text } from "../../../theme/components";

function duration(seconds: number) {
  const value = Math.round(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = String(value % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}
/** 서버 원본 영수증이 있는 기록만 시간으로 표시한다. 구형 저장값을 PB로 인증하지 않는다. */
export default function RunRecordsSummary({ evidence, readiness = false }: { evidence: RunEvidence; readiness?: boolean }) {
  const { t } = useTranslation("fitness");
  const qualified = qualifiedRunRecords(evidence);
  return <Card data-testid="K5-4">
    <Text as="h2" variant="title">{t(readiness ? "runReadiness.title" : "runRecords.title")}</Text>
    {readiness && <Text as="p" variant="body" tone="secondary">{t("runReadiness.body")}</Text>}
    {!readiness && qualified.length === 0 && <Text as="p" variant="bodySmall" tone="secondary">{t(evidence.unverifiedRecords?.length ? "runRecords.unverified" : "runRecords.none")}</Text>}
    {qualified.length > 0 && (["5km", "10km"] as const).map(distance => {
      const best = qualified.filter(record => record.distance === distance).sort((a, b) => a.seconds - b.seconds)[0];
      const legacy = evidence.unverifiedRecords?.some(record => record.distance === distance);
      return <Text data-testid="K5-4-1" as="p" key={distance}>{t(`runRecords.dist.${distance}`)} · {best ? `${duration(best.seconds)} · ${best.date}` : t(legacy ? "runRecords.unverifiedLabel" : "runRecords.none")}</Text>;
    })}
    {readiness && evidence.unverifiedRecords?.length ? <Text as="p" variant="bodySmall" tone="secondary">{t("runRecords.unverified")}</Text> : null}
    <div className="flex flex-wrap items-center gap-2">
    {readiness && <LocalizedLink className={buttonClass({ variant: "primary" })} to="/coach/condition?sport=run#thresholds">{t("runReadiness.setThresholds")}</LocalizedLink>}
    <LocalizedLink className={readiness ? buttonClass({ variant: "outline" }) : undefined} data-testid="K5-4-2" to="/athlete/me/records?sport=run">{t("runRecords.viewAll")}</LocalizedLink>
    </div>
  </Card>;
}
