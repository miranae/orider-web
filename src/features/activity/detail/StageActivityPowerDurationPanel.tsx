import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { useStageActivityPowerDuration } from "../../../hooks/useStageActivityPowerDuration";
import { Button, Input, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { formatElapsedBoundary } from "./activityRangeSelection";
export default function StageActivityPowerDurationPanel({ activity, scopeKey = "" }: { activity: Activity; scopeKey?: string }) {
  const { t, i18n } = useTranslation("activity"), id = useId();
  const [draft, setDraft] = useState("17");
  const tool = useStageActivityPowerDuration(activity, draft, scopeKey);
  if (!tool.available) return null;
  const result = tool.response?.result;
  return <details className="activity-growth-evidence text-[length:var(--fs-md)]">
    <summary className="cursor-pointer py-3 font-semibold">{t("stagePowerDuration.title")}</summary>
    <div className="space-y-3 pt-3">
      <Text as="p" variant="bodyMedium" tone="secondary">{t("stagePowerDuration.scope")}</Text>
      <LocalizedLink className="inline-flex min-h-[calc(var(--dim-button-height)+var(--space-1))] items-center underline" to={`/activity/${encodeURIComponent(activity.id)}`}>{t("stagePowerDuration.current", { date: new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(activity.startTime) })}</LocalizedLink>
      <Button size="sm" className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={tool.busy} onClick={() => void tool.load()}>{t("stagePowerDuration.load")}</Button>
      {tool.busy && <Text as="p" variant="bodyMedium" role="status">{t("stagePowerDuration.loading")}</Text>}
      {tool.error && <Text as="p" variant="bodyMedium" role="alert">{t(tool.reloadRequired ? "stagePowerDuration.changed" : "stagePowerDuration.error")}</Text>}
      {tool.metadata?.state === "unavailable" && <Text as="p" variant="bodyMedium">{t("stagePowerDuration.missing")}</Text>}
      {tool.metadata?.state === "available" && <>
        {(tool.metadata.maxIntegerDurationSeconds ?? 0) > 0 && <Text as="p" variant="bodyMedium" tone="secondary">{t("stagePowerDuration.supported", { seconds: tool.metadata.maxIntegerDurationSeconds })}</Text>}
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (tool.canCalculate) void tool.calculate(); }}>
          <label htmlFor={id}><Text as="span" variant="bodyMedium">{t("stagePowerDuration.duration")}</Text></label>
          <Input id={id} type="text" inputMode="numeric" value={draft} onChange={event => setDraft(event.target.value)} aria-invalid={!tool.canCalculate && !tool.busy && !tool.reloadRequired} />
          <Button type="submit" size="sm" className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={!tool.canCalculate}>{t("stagePowerDuration.calculate")}</Button>
        </form>
        {tool.metadata.maxIntegerDurationSeconds === 0 && <Text as="p" variant="bodyMedium">{t("stagePowerDuration.noWindow")}</Text>}
      </>}
      {tool.response?.state === "unavailable" && <Text as="p" variant="bodyMedium">{t(tool.reloadRequired ? "stagePowerDuration.changed" : "stagePowerDuration.noWindow")}</Text>}
      {result?.state === "available" && <section className="space-y-2" aria-label={t("stagePowerDuration.result")}>
        <Text as="p" variant="dataMedium" weight={600}>{new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(result.maxAveragePowerW)} W · {formatElapsedBoundary(result.requestedDurationSeconds)}</Text>
        <Text as="p" variant="bodyMedium">{t("stagePowerDuration.window", { start: formatElapsedBoundary(result.windowStartElapsedSec), end: formatElapsedBoundary(result.windowEndElapsedSec) })}</Text>
        <LocalizedLink className="inline-flex min-h-[calc(var(--dim-button-height)+var(--space-1))] items-center underline" to={`/activity/${encodeURIComponent(activity.id)}`}>{t("stagePowerDuration.source")}</LocalizedLink>
        <details><summary className="cursor-pointer py-3">{t("stagePowerDuration.basis")}</summary>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("stagePowerDuration.slots")}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("stagePowerDuration.unknown")}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("stagePowerDuration.separate")}</Text>
          {tool.response?.source?.qualification === "legacy_manifest_revision_and_gcs_token_pinned" && <Text as="p" variant="bodyMedium" tone="secondary">{t("stagePowerDuration.legacy")}</Text>}
        </details>
      </section>}
    </div>
  </details>;
}
