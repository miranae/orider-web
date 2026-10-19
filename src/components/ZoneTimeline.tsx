import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SampleTiming } from "../utils/sampleTime";
import type { StreamTimeArray } from "../utils/streamTime";
import { SegmentTimeline, Section } from "../theme/components";
import { buildZoneTimeline, resolveZoneTimelineAxis } from "../utils/zoneTimeline";

export interface ZoneTimelineSeries {
  id: "hr" | "power";
  label: string;
  values: readonly number[] | undefined;
  time: StreamTimeArray;
  timing?: SampleTiming;
  resolveZone: (value: number) => number | null;
  maxZone: number;
}

export const zoneColor = (seriesId: ZoneTimelineSeries["id"], zone: number, maxZone: number) => {
  if (seriesId === "power" && zone === 7) return "var(--violet)";
  return `var(--zone-${Math.min(5, Math.max(1, Math.ceil((zone / maxZone) * 5)))})`;
};

function formatTimelineTime(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatBucketComposition(
  bucket: ReturnType<typeof buildZoneTimeline>[number],
  noDataLabel: string,
): string {
  return bucket.segments.map((segment) => {
    const label = segment.zone == null ? noDataLabel : `Z${segment.zone}`;
    const percentage = Math.round((segment.durationSec / bucket.durationSec) * 100);
    return `${label} ${percentage}%`;
  }).join(", ");
}

/** Compact, keyboard/screen-reader-described zone sequence for activity analysis. */
export default function ZoneTimeline({ series, bucketCount = 32, movingDurationSec }: { series: ZoneTimelineSeries[]; bucketCount?: number; movingDurationSec?: number }) {
  const { t } = useTranslation("activity");
  const formatDuration = (seconds: number): string => {
    const rounded = Math.round(seconds);
    const minutes = Math.floor(rounded / 60);
    if (minutes === 0) return t("analysis.zones.timelineSeconds", { count: rounded });
    if (minutes < 60) return t("analysis.zones.timelineMinutes", { count: minutes });
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0
      ? t("analysis.zones.timelineHours", { count: hours })
      : t("analysis.zones.timelineHoursMinutes", { hours, minutes: remainingMinutes });
  };
  const axis = useMemo(() => resolveZoneTimelineAxis(series, movingDurationSec), [movingDurationSec, series]);
  const rows = useMemo(() => series.map((item) => ({ ...item, buckets: buildZoneTimeline(item.values, item.time, item.resolveZone, item.timing, bucketCount, axis) }))
    .filter((item) => item.buckets.length > 0 && item.buckets.some((bucket) => bucket.zone != null)), [axis, bucketCount, series]);
  if (!rows.length) return null;
  const durationSec = axis?.durationSec ?? 0;

  return <Section className="mt-5" headingLevel={4}
    title={t("analysis.zones.timelineTitle")} description={t("analysis.zones.timelineDesc")}
    actions={t("analysis.zones.timelineDuration", { duration: formatDuration(durationSec) })}>
    <SegmentTimeline aria-label={t("analysis.zones.timelineAria", { duration: formatDuration(durationSec) })}
      accessibleHint={t("analysis.zones.timelineAccessible")}
      rows={rows.map(row => ({ id: row.id, label: row.label, surface: row.id === "power" ? "sheen" : "plain",
        buckets: row.buckets.map((bucket, index) => ({ id: String(index), weight: bucket.durationSec || 1,
          label: t("analysis.zones.timelineInterval", { start: formatTimelineTime(bucket.startSec), end: formatTimelineTime(bucket.endSec), zone: formatBucketComposition(bucket, t("analysis.zones.timelineNoData")) }),
          segments: bucket.segments.map(segment => ({ weight: segment.durationSec, color: segment.zone == null ? null : zoneColor(row.id, segment.zone, row.maxZone) })),
        })),
      }))} />
  </Section>;
}
