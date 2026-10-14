import type { Activity } from "@shared/types";
import { useTranslation } from "react-i18next";
import { useLocale } from "../../contexts/LocaleContext";
import { useRunHistory } from "../../hooks/useRunHistory";
import { latestShoeStatus } from "../../utils/shoeStatus";
import { formatDistance } from "../../utils/units";
import { Chip, Text } from "../../theme/components";
import { SettingsCard } from "./_primitives";

/** Existing A013 owner reader: at most 200 activities within the last eight weeks. */
export function GearShoeStatus() {
  const { t } = useTranslation("settings");
  const { units } = useLocale();
  const { runs, loading, available } = useRunHistory(8);
  const validRuns = runs.filter(activity =>
    activity.gear?.type === "shoes" && Number.isFinite(activity.startTime) &&
    Number.isFinite(activity.gear.totalDistanceKm) && activity.gear.totalDistanceKm >= 0 &&
    Number.isFinite(activity.gear.maxDistanceKm) && (activity.gear.maxDistanceKm ?? 0) > 0,
  );
  const identified = new Map<string, Activity[]>();
  const legacy: Activity[] = [];
  let conflictingIdentity = false;
  for (const activity of validRuns) {
    const ids = [activity.gearId, activity.sourceMeta?.extra?.gearId, activity.sourceMeta?.extra?.stravaGearId]
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map(id => id.trim());
    const uniqueIds = new Set(ids);
    if (uniqueIds.size > 1) { conflictingIdentity = true; continue; }
    const id = ids[0];
    if (id) identified.set(id, [...(identified.get(id) ?? []), activity]);
    else legacy.push(activity);
  }
  const shoes = [...identified.entries()].map(([id, snapshots]) => ({ id, shoe: latestShoeStatus(snapshots) }));
  const legacyShoe = latestShoeStatus(legacy);
  if (legacyShoe) shoes.push({ id: "", shoe: legacyShoe });
  return <SettingsCard data-testid="P4-3" title={t("shoeSnapshot.title")}>
    <Text as="p" variant="caption" tone="secondary">{t("shoeSnapshot.coverage")}</Text>
    {loading ? <p data-testid="P4.loading" role="status">{t("shoeSnapshot.loading")}</p>
      : !available ? <p data-testid="P4.error" role="alert">{t("shoeSnapshot.unavailable")}</p>
      : shoes.length === 0 ? <p data-testid="P4.shoeEmpty">{t("shoeSnapshot.empty")}</p>
      : shoes.map(({ id, shoe }) => shoe && <div key={id ? `identified:${id}` : "legacy"} data-testid="P4-3-1" className="space-y-2 mt-3">
        <Text as="p" weight={600}>{shoe.name}</Text>
        <Text as="p" variant="caption" tone="secondary">{id ? t("shoeSnapshot.identity", { id }) : t("shoeSnapshot.legacyIdentity")}</Text>
        <Text as="p">{t("shoeSnapshot.total", { distance: formatDistance(shoe.totalDistanceKm * 1000, units) })}</Text>
        <Text as="p">{t("shoeSnapshot.remaining", { distance: formatDistance(shoe.remainingKm * 1000, units), maximum: formatDistance(shoe.maxDistanceKm * 1000, units) })}</Text>
        {shoe.replacementDue && <Chip>{t("shoeSnapshot.replacementDue")}</Chip>}
      </div>)}
    {!loading && available && conflictingIdentity && <p role="status">{t("shoeSnapshot.conflictingIdentity")}</p>}
  </SettingsCard>;
}
