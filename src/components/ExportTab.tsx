import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Activity, ActivityStreams } from "@shared/types";
import { generateTcx } from "../utils/exportTcx";
import { generateCsv } from "../utils/exportCsv";
import { generateFit } from "../utils/exportFit";
import { generateGpx } from "../utils/exportGpx";

interface ExportTabProps {
  activity: Activity;
  streams: ActivityStreams;
}

function makeFilename(activity: Activity, ext: string): string {
  const date = new Date(activity.startTime);
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const name = (activity.description || "ride").replace(/[^a-zA-Z0-9가-힣]/g, "_").slice(0, 30);
  return `${dateStr}_${name}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const FORMATS = [
  { id: "fit", label: "FIT", descKey: "export.formatFitDesc", icon: "📦" },
  { id: "tcx", label: "TCX", descKey: "export.formatTcxDesc", icon: "📄" },
  { id: "gpx", label: "GPX", descKey: "export.formatGpxDesc", icon: "🗺️" },
  { id: "csv", label: "CSV", descKey: "export.formatCsvDesc", icon: "📊" },
] as const;

export default function ExportTab({ activity, streams }: ExportTabProps) {
  const { t } = useTranslation("activity");

  const handleExport = useCallback((format: string) => {
    try {
      switch (format) {
        case "fit": {
          const data = generateFit(activity, streams);
          const ab = new ArrayBuffer(data.byteLength);
          new Uint8Array(ab).set(data);
          downloadBlob(new Blob([ab], { type: "application/octet-stream" }), makeFilename(activity, "fit"));
          break;
        }
        case "tcx": {
          const xml = generateTcx(activity, streams);
          downloadBlob(new Blob([xml], { type: "application/xml" }), makeFilename(activity, "tcx"));
          break;
        }
        case "csv": {
          const csv = generateCsv(streams);
          downloadBlob(new Blob([csv], { type: "text/csv" }), makeFilename(activity, "csv"));
          break;
        }
        case "gpx": {
          const gpx = generateGpx(activity, streams);
          if (gpx) {
            downloadBlob(new Blob([gpx], { type: "application/gpx+xml" }), makeFilename(activity, "gpx"));
          }
          break;
        }
      }
    } catch (err) {
      console.error("export failed:", err);
      alert(t("export.errorAlert"));
    }
  }, [activity, streams, t]);

  const hasGps = !!streams.latlng?.length;
  const hasPower = !!streams.watts?.length;
  const hasHr = !!streams.heartrate?.length;
  const pointCount = streams.time?.length || streams.latlng?.length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[length:var(--fs-sm)] font-semibold mb-1" style={{ color: "var(--ink-1)" }}>{t("export.heading")}</h3>
        <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
          {t("export.dataSummary", { value: pointCount.toLocaleString() })}
          {hasGps && ` · ${t("export.tagGps")}`}
          {hasHr && ` · ${t("export.tagHr")}`}
          {hasPower && ` · ${t("export.tagPower")}`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FORMATS.map((fmt) => {
          const disabled = fmt.id === "gpx" && !hasGps;
          return (
            <button
              key={fmt.id}
              onClick={() => handleExport(fmt.id)}
              disabled={disabled}
              className={`flex items-start gap-3 p-4 rounded-[var(--r-lg)] border text-left transition-colors ${
                disabled
                  ? "border-[var(--line-soft)] opacity-40 cursor-not-allowed"
                  : "border-[var(--line-soft)] hover:border-[var(--lime)] hover:bg-[var(--bg-1)]"
              }`}
            >
              <span className="text-[length:var(--fs-2xl)]">{fmt.icon}</span>
              <div>
                <div className="font-semibold text-[length:var(--fs-sm)]">{fmt.label}</div>
                <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: "var(--ink-2)" }}>{t(fmt.descKey)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
