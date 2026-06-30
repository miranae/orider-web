import type { TFunction } from "i18next";
import type { Activity, ActivityStreams } from "@shared/types";
import RouteMap from "../../../components/RouteMap";
import { Card } from "../../../theme/components";
import { formatDuration, type SegmentEffortData, type SportCategory } from "./activityDetailUtils";
import type { UploadedPhoto } from "./activityDisplay";

type StreamPhoto = {
  id: string | number;
  url?: string | null;
  location?: [number, number] | null;
  caption?: string | null;
};

type ActivityMediaPanelProps = {
  activity: Activity;
  streams: ActivityStreams | null;
  sport: SportCategory;
  hasTrack: boolean;
  summary: Activity["summary"];
  markerPosition: [number, number] | null;
  hoveredSegment: SegmentEffortData | null;
  photos: StreamPhoto[];
  uploadedPhotos: UploadedPhoto[];
  flyToPosition: [number, number] | null;
  t: TFunction<"activity">;
};

export function ActivityMediaPanel({
  activity,
  streams,
  sport,
  hasTrack,
  summary,
  markerPosition,
  hoveredSegment,
  photos,
  uploadedPhotos,
  flyToPosition,
  t,
}: ActivityMediaPanelProps) {
  if (hasTrack) {
    return (
      <div className="-mx-6 sm:-mx-8 lg:mx-[calc((100vw-1440px)/-2-24px)] xl:mx-0" style={{ marginTop: -24 }}>
        <RouteMap
          polyline={activity.thumbnailTrack}
          latlng={streams?.latlng}
          height="h-[360px]"
          interactive
          markerPosition={markerPosition}
          highlightRange={hoveredSegment ? {
            startIndex: hoveredSegment.startIndex,
            endIndex: hoveredSegment.endIndex,
          } : undefined}
          photos={[
            ...photos
              .filter((p) => p.url && p.location)
              .map((p) => ({ id: String(p.id), url: p.url!, location: p.location!, caption: p.caption })),
            ...uploadedPhotos
              .filter((p) => p.location)
              .map((p) => ({ id: `upload-${p.id}`, url: p.url, location: p.location!, caption: null as string | null })),
          ]}
          flyToPosition={flyToPosition}
          fallbackImageUrl={activity.mapImageUrl}
        />
      </div>
    );
  }

  if (sport === "swim") {
    return (
      <Card padding="none" style={{ padding: "var(--space-5)" }}>
        <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: "var(--ink-1)" }}>
          {t("page.swim.setTimeline")}
        </h3>
        <div
          style={{
            position: "relative",
            height: 160,
            background: "linear-gradient(180deg, var(--bg-2), var(--bg-1))",
            borderRadius: "var(--r-md)",
            overflow: "hidden",
            border: "1px solid var(--line-soft)",
          }}
        >
          {[0.25, 0.5, 0.75].map((p) => (
            <div
              key={p}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: `${p * 100}%`,
                height: 1,
                background: "repeating-linear-gradient(90deg, color-mix(in srgb, var(--aqua) 30%, transparent) 0 10px, transparent 10px 16px)",
              }}
            />
          ))}
          <div style={{ position: "absolute", inset: "20px 20px 30px", display: "flex", alignItems: "flex-end" }}>
            <div
              style={{
                width: "100%",
                height: "80%",
                background: "var(--aqua)",
                opacity: 0.7,
                borderRadius: "3px 3px 0 0",
                border: "1px solid var(--aqua)",
              }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              bottom: 8,
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--fs-2xs)",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-4)",
            }}
          >
            <span>0m</span>
            <span>{Math.round(summary.distance / 2).toLocaleString()}m</span>
            <span>{Math.round(summary.distance).toLocaleString()}m</span>
          </div>
        </div>
        <div className="text-[length:var(--fs-xs)] mt-2" style={{ color: "var(--ink-3)" }}>
          {t("page.swim.totalSummary", { distance: Math.round(summary.distance).toLocaleString(), time: formatDuration(summary.ridingTimeMillis) })}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="none" className="px-6 py-8 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "color-mix(in srgb, var(--lime) 12%, transparent)" }}>
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--lime)" }}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 8v1m0 6v1m-4-4h1m6 0h1" />
        </svg>
      </div>
      <div>
        <p className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>
          {activity.type?.toLowerCase().includes("virtual") ? t("page.indoor") : t("page.noGps")}
        </p>
        <p className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-2)" }}>
          {t("page.noGpsDesc")}
        </p>
      </div>
    </Card>
  );
}
