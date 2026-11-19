import { useCallback, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Activity, ActivityStreams } from "@shared/types";
import { generateTcx } from "../utils/exportTcx";
import { generateCsv } from "../utils/exportCsv";
import { generateFit } from "../utils/exportFit";
import { generateGpx } from "../utils/exportGpx";
import { exportFilename } from "../utils/exportSport";
import { useToast } from "../contexts/ToastContext";
import { readStreamCadenceUnit } from "../services/activityStreamSource";
import { isPublicActivityAccessError } from "../services/publicActivityDetail";
import { logClientError } from "../services/errorLogger";

interface ExportTabProps {
  activity: Activity;
  streams: ActivityStreams;
  resolveCurrentStreams?: () => Promise<ActivityStreams>;
  resolveOwnerCadenceStreams?: () => Promise<ActivityStreams | null>;
  getExportAccount?: () => object | null;
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

export default function ExportTab({ activity, streams, resolveCurrentStreams, resolveOwnerCadenceStreams, getExportAccount }: ExportTabProps) {
  const { t } = useTranslation("activity");
  const { showToast } = useToast();
  const generation = useRef(0);
  useLayoutEffect(() => { generation.current++; return () => { generation.current++; }; }, [activity, streams, resolveCurrentStreams, resolveOwnerCadenceStreams, getExportAccount]);

  const handleExport = useCallback(async (format: string) => {
    const request = generation.current;
    const account = getExportAccount?.();
    const stillCurrent = () => request === generation.current && getExportAccount?.() === account;
    try {
      const cadenceFormat = format === "fit" || format === "tcx";
      const needsOwnerCadence = cadenceFormat && readStreamCadenceUnit(streams) === undefined
        && Array.isArray(streams.cadence) && streams.cadence.some(value => Number.isFinite(value) && value >= 0);
      let currentStreams = streams;
      if (resolveCurrentStreams) {
        currentStreams = await resolveCurrentStreams();
      } else if (needsOwnerCadence && resolveOwnerCadenceStreams) {
        try {
          currentStreams = await resolveOwnerCadenceStreams() ?? streams;
        } catch (error) {
          const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
          const scopeChanged = error instanceof Error && ["account_changed", "activity_stream_changed"].includes(error.message);
          const denied = scopeChanged || isPublicActivityAccessError(error) || code === "functions/unauthenticated";
          const current = stillCurrent();
          if (denied && current) throw error;
          logClientError("ExportTab.ownerCadenceLookup", error, current ? { activityId: activity.id } : undefined);
          if (!current) return;
        }
      }
      if (!stillCurrent()) return;
      const fileCadenceUnit = readStreamCadenceUnit(currentStreams);
      switch (format) {
        case "fit": {
          const data = generateFit(activity, currentStreams, fileCadenceUnit);
          const ab = new ArrayBuffer(data.byteLength);
          new Uint8Array(ab).set(data);
          downloadBlob(new Blob([ab], { type: "application/octet-stream" }), exportFilename(activity, "fit"));
          break;
        }
        case "tcx": {
          const xml = generateTcx(activity, currentStreams, fileCadenceUnit);
          downloadBlob(new Blob([xml], { type: "application/xml" }), exportFilename(activity, "tcx"));
          break;
        }
        case "csv": {
          const csv = generateCsv(currentStreams);
          downloadBlob(new Blob([csv], { type: "text/csv" }), exportFilename(activity, "csv"));
          break;
        }
        case "gpx": {
          const gpx = generateGpx(activity, currentStreams);
          if (gpx) {
            downloadBlob(new Blob([gpx], { type: "application/gpx+xml" }), exportFilename(activity, "gpx"));
          }
          break;
        }
      }
    } catch (err) {
      logClientError("ExportTab.export", err, { activityId: activity.id, format });
      showToast(t("export.errorAlert"), "error");
    }
  }, [activity, streams, resolveCurrentStreams, resolveOwnerCadenceStreams, getExportAccount, t, showToast]);

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
