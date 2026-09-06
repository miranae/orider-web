import { useTranslation } from "react-i18next";
import { useCanonicalHomeSummary } from "../hooks/useCanonicalHomeSummary";
import { Card, Text } from "../theme/components";
import { useLocale } from "../contexts/LocaleContext";

/** Rolling seven days only; calendar totals and local sport-distance filters are separate. */
export default function CanonicalHomeSummaryCard() {
  const { t } = useTranslation("dashboard");
  const { totals, display } = useCanonicalHomeSummary();
  const { units } = useLocale();
  const imperial = units === "imperial";
  return <Card>
    <Text as="h2" variant="subtitle">{t("kpi.subRecent7d")}</Text>
    {!totals ? <p role={display === "error" ? "alert" : "status"}>
      {t(display === "error" ? "canonical.failed" : "canonical.pending")}
    </p> : <>
      {display === "value_with_stale_hint" && <p role="status">{t("canonical.stale")}</p>}
      <dl className="grid grid-cols-2 gap-3">
        <div><dt>{t("kpi.rides")}</dt><dd>{totals.activityCount}</dd></div>
        <div><dt>{t("kpi.weekDistance")}</dt><dd>{(totals.distanceMeters / (imperial ? 1609.344 : 1000)).toFixed(1)} {imperial ? "mi" : "km"}</dd></div>
        <div><dt>{t("kpi.movingTime")}</dt><dd>{(totals.movingMillis / 3600000).toFixed(1)} h</dd></div>
        <div><dt>{t("kpi.elevation")}</dt><dd>{Math.round(totals.elevationGainMeters / (imperial ? 0.3048 : 1))} {imperial ? "ft" : "m"}</dd></div>
      </dl>
    </>}
  </Card>;
}
