import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SampleTiming } from "../utils/sampleTime";
import type { StreamTimeArray } from "../utils/streamTime";
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

  return (
    <section className="mt-5" aria-labelledby="zone-timeline-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
        <div>
          <h4 id="zone-timeline-title" className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>
            {t("analysis.zones.timelineTitle")}
          </h4>
          <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("analysis.zones.timelineDesc")}</p>
        </div>
        <span className="text-[length:var(--fs-xs)] tabular-nums" style={{ color: "var(--ink-3)" }}>
          {t("analysis.zones.timelineDuration", { duration: formatDuration(durationSec) })}
        </span>
      </div>
      <div className="space-y-2" role="group" aria-label={t("analysis.zones.timelineAria", { duration: formatDuration(durationSec) })}>
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[auto_1fr] items-center gap-2">
            <span className="w-9 text-[length:var(--fs-xs)] font-medium" style={{ color: "var(--ink-2)" }}>{row.label}</span>
            <div className="flex h-5 overflow-hidden rounded-[var(--r-sm)]" style={{ background: "var(--bg-2)" }} aria-label={row.label}>
              {row.buckets.map((bucket, index) => (
                <span
                  key={index}
                  className="min-w-0 border-r"
                  style={{ flex: bucket.durationSec || 1, background: bucket.zone == null ? "var(--bg-3)" : zoneColor(row.id, bucket.zone, row.maxZone), borderColor: "var(--bg-0)" }}
                  role="img"
                  aria-label={t("analysis.zones.timelineInterval", {
                    start: formatTimelineTime(bucket.startSec),
                    end: formatTimelineTime(bucket.endSec),
                    zone: bucket.zone == null ? t("analysis.zones.timelineNoData") : `Z${bucket.zone}`,
                  })}
                  title={t("analysis.zones.timelineInterval", {
                    start: formatTimelineTime(bucket.startSec),
                    end: formatTimelineTime(bucket.endSec),
                    zone: bucket.zone == null ? t("analysis.zones.timelineNoData") : `Z${bucket.zone}`,
                  })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="sr-only">{t("analysis.zones.timelineAccessible")}</p>
    </section>
  );
}
