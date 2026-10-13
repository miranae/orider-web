import type { Activity } from "@shared/types";
import { useTranslation } from "react-i18next";
import { Button, Stack, Text } from "../../../theme";
import { useLocale } from "../../../contexts/LocaleContext";
import { useObservedRouteComparison } from "../../../hooks/useObservedRouteComparison";
import "./observed-route-comparison.css";
export function ObservedRouteComparisonPanel({ current, previous }: { current: Activity; previous: Activity }) {
  const { t, i18n } = useTranslation("activity");
  const { units } = useLocale();
  const comparison = useObservedRouteComparison(current, previous);
  const result = comparison.result;
  const distance = (meters: number) => `${(meters * (units === "imperial" ? 3.280839895 : 1)).toFixed(1)} ${units === "imperial" ? "ft" : "m"}`;
  const date = (time: number) => Number.isFinite(time) && Number.isFinite(new Date(time).getTime())
    ? new Date(time).toLocaleString(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }) : "—";
  const best = result && result.state !== "unavailable" ? result.direction === "reverse" ? result.reverse : result.forward : null;
  if (!comparison.enabled) return null;
  return <section className="observed-route-comparison" aria-label={t("observedRoute.title")}>
    <Text as="h4" variant="bodyMedium" weight={600}>{t("observedRoute.title")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRoute.actionNote")}</Text>
    <Button size="sm" loading={comparison.state === "loading"} disabled={comparison.state === "loading"} onClick={() => void comparison.compare()}>{t("observedRoute.compare")}</Button>
    {comparison.state !== "idle" && comparison.state !== "available" && <Text as="p" variant="bodyMedium" tone="secondary" role="status">{t(`observedRoute.states.${comparison.state}`)}</Text>}
    {result && result.state !== "unavailable" && <>
      <Text as="p" variant="bodyMedium" weight={600}>{t(`observedRoute.guidance.${result.shapeGuidance}`)}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRoute.limits")}</Text>
      <Stack direction="row" wrap gap="var(--space-3)">{[current, previous].map((activity, index) => <a key={activity.id} className="activity-growth-source-link" href={`/${i18n.language.startsWith("ko") ? "ko" : "en"}/activity/${encodeURIComponent(activity.id)}`}><Text variant="bodyMedium">{t(index ? "observedRoute.previous" : "observedRoute.current")} · {date(activity.startTime)}</Text></a>)}</Stack>
      {best && <div className="observed-route-values"><div><Text as="p" variant="bodyMedium" tone="secondary">{t("observedRoute.mean")}</Text><Text variant="bodyMedium" mono>{distance(best.meanSeparationM)}</Text></div><div><Text as="p" variant="bodyMedium" tone="secondary">{t("observedRoute.p95")}</Text><Text variant="bodyMedium" mono>{distance(best.p95SeparationM)}</Text></div></div>}
      <Text as="p" variant="bodyMedium">{t(`observedRoute.direction.${result.direction}`)} · {t("observedRoute.lengthRatio", { percent: (result.lengthRatio * 100).toFixed(1) })}</Text>
      {result.limitations.includes("gaps") || result.limitations.includes("coverage_not_complete") ? <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRoute.partial")}</Text> : null}
      <details><summary>{t("observedRoute.details")}</summary><Stack gap="var(--space-3)">
        {best && <Text as="p" variant="bodyMedium">{t("observedRoute.endpoints", { start: distance(best.startSeparationM), end: distance(best.endSeparationM) })}</Text>}
        {result.diagnostics.map((diagnostic, index) => <Text key={index} as="p" variant="bodyMedium" tone="secondary">{t(index ? "observedRoute.previous" : "observedRoute.current")}: {t("observedRoute.coverage", { length: distance(diagnostic.observedLengthM), count: diagnostic.inputPointCount, gaps: diagnostic.gapCount, seconds: diagnostic.omittedGapElapsedSec.toFixed(1) })} · {t(`observedRoute.collection.${diagnostic.coverage}`)}</Text>)}
      </Stack></details>
    </>}
  </section>;
}
