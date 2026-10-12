import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { BIKE_DISTANCE_TARGETS, type BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import { useStageCyclingDistanceEffortPreference } from "../../../hooks/useStageCyclingDistanceEffortPreference";
import { Button, Select, Text } from "../../../theme";
import { formatElapsedBoundary } from "./activityRangeSelection";
export default function StageCyclingDistanceEffortPreferencePanel({ activity, scopeKey }: { activity: Activity; scopeKey: string }) {
  const { t } = useTranslation("activity"), id = useId();
  const [target, setTarget] = useState<BikeDistanceKey>("10km");
  const tool = useStageCyclingDistanceEffortPreference(activity, scopeKey);
  if (!tool.available) return null;
  const row = tool.read?.efforts.find(v => v.target === target);
  const enabled = row?.excluded ? !!row.restoreBinding : !!row?.excludeBinding;
  const elapsed = (value: number | null) => value === null ? t("cyclingEffortPreference.unknown") : formatElapsedBoundary(value);
  return <details className="text-[length:var(--fs-md)]">
    <summary className="cursor-pointer py-3 font-semibold">{t("cyclingEffortPreference.title")}</summary>
    <div className="space-y-3 pt-3">
      <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingEffortPreference.scope")}</Text>
      <Button size="sm" variant="outline" className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={tool.busy} onClick={() => void tool.inspect()}>{t("cyclingEffortPreference.inspect")}</Button>
      {tool.busy && <Text as="p" variant="bodyMedium" role="status">{t("cyclingEffortPreference.loading")}</Text>}
      {tool.failure && <Text as="p" variant="bodyMedium" role="alert">{t(`cyclingEffortPreference.${tool.failure}`)}</Text>}
      {tool.saved && <Text as="p" variant="bodyMedium" role="status">{t("cyclingEffortPreference.saved")}</Text>}
      {tool.read && <>
        <label htmlFor={id}><Text variant="bodyMedium">{t("manualBikeEvidence.distance")}</Text></label>
        <Select id={id} className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" value={target} onChange={event => setTarget(event.target.value as BikeDistanceKey)}>{BIKE_DISTANCE_TARGETS.map(key => <option key={key} value={key}>{t(`manualBikeEvidence.distances.${key}`)}</option>)}</Select>
        {row && <>
          {!row.excluded && row.originalElapsedSeconds === null && row.effectiveElapsedSeconds === null ? <Text as="p" variant="bodyMedium">{t("cyclingEffortPreference.cannotExclude")}</Text> : <>
            <Text as="p" variant="bodyMedium">{t("cyclingEffortPreference.original", { value: elapsed(row.originalElapsedSeconds) })}</Text>
            <Text as="p" variant="bodyMedium">{t(row.excluded ? "cyclingEffortPreference.excluded" : "cyclingEffortPreference.selected", { value: elapsed(row.effectiveElapsedSeconds) })}</Text>
          </>}
          {row.sourceStatus !== "observed" && <Text as="p" variant="bodyMedium" tone="secondary">{t(tool.read.observationState === "legacy_unsupported" ? "cyclingEffortPreference.legacyUnsupported" : `cyclingEffortPreference.${row.sourceStatus}`)}</Text>}
          {row.excluded && row.restoreBinding && <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingEffortPreference.restoreAvailable")}</Text>}
          <Button size="sm" variant="outline" className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={tool.busy || !enabled} onClick={() => void tool.save(target)}>{t(row.excluded ? "cyclingEffortPreference.restore" : "cyclingEffortPreference.exclude")}</Button>
        </>}
        <details><summary className="cursor-pointer py-3">{t("cyclingEffortPreference.basis")}</summary><Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingEffortPreference.basisNote")}</Text></details>
      </>}
    </div>
  </details>;
}
