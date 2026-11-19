import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity, ActivityStreams } from "@shared/types";
import { generateTcx } from "../utils/exportTcx";
import { generateCsv } from "../utils/exportCsv";
import { generateFit } from "../utils/exportFit";
import { generateGpx } from "../utils/exportGpx";
import { needsExportCadenceUnit } from "../utils/exportCadence";
import { markStreamCadenceUnit } from "../services/activityStreamSource";
import { exportFilename, exportSportOf } from "../utils/exportSport";
import { useToast } from "../contexts/ToastContext";
import { logClientError } from "../services/errorLogger";

interface ExportTabProps {
  activity: Activity;
  streams: ActivityStreams;
  resolveCurrentStreams?: () => Promise<ActivityStreams>;
}

type ExportFormat = "fit" | "tcx" | "gpx" | "csv";
type CadenceChoice = "spm" | "strides_per_minute" | "omit";
type CadencePrompt = ExportTabProps & { format: "fit" | "tcx"; samples: string };

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

export default function ExportTab({ activity, streams, resolveCurrentStreams }: ExportTabProps) {
  const { t } = useTranslation("activity");
  const { showToast } = useToast();
  const generation = useRef(0);
  const [cadencePrompt, setCadencePrompt] = useState<CadencePrompt | null>(null);
  const pending = cadencePrompt?.activity === activity && cadencePrompt.streams === streams
    && cadencePrompt.resolveCurrentStreams === resolveCurrentStreams ? cadencePrompt : null;
  useEffect(() => { generation.current++; return () => { generation.current++; }; },
    [activity.id, activity.type, activity.source, streams, resolveCurrentStreams]);

  const handleExport = useCallback(async (format: ExportFormat, choice?: { unit: CadenceChoice; samples: string }) => {
    const request = generation.current;
    setCadencePrompt(null);
    try {
      const currentStreams = resolveCurrentStreams ? await resolveCurrentStreams() : streams;
      if (request !== generation.current) return;
      let fileStreams = choice?.unit === "omit" ? { ...currentStreams, cadence: undefined } : currentStreams;
      if ((format === "fit" || format === "tcx")
        && needsExportCadenceUnit(activity, fileStreams, exportSportOf(activity))) {
        const samples = JSON.stringify([currentStreams.time, currentStreams.cadence]);
        if (!choice || choice.samples !== samples) {
          setCadencePrompt({ activity, streams, resolveCurrentStreams, format, samples });
          return;
        }
        fileStreams = markStreamCadenceUnit(currentStreams, choice.unit);
      }
      switch (format) {
        case "fit": {
          const data = generateFit(activity, fileStreams);
          const ab = new ArrayBuffer(data.byteLength);
          new Uint8Array(ab).set(data);
          downloadBlob(new Blob([ab], { type: "application/octet-stream" }), exportFilename(activity, "fit"));
          break;
        }
        case "tcx": {
          const xml = generateTcx(activity, fileStreams);
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
      if (request !== generation.current) return;
      showToast(t("export.errorAlert"), "error");
    }
  }, [activity, streams, resolveCurrentStreams, t, showToast]);

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

      {pending && (
        <fieldset className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-4">
          <legend className="font-semibold">{t("export.cadenceUnitTitle")}</legend>
          <p className="text-[length:var(--fs-sm)]">{t("export.cadenceUnitHelp")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["spm", "strides_per_minute", "omit"] as const).map(unit => (
              <button key={unit} type="button" className="rounded-[var(--r-md)] border border-[var(--line-soft)] px-3 py-2"
                onClick={() => { void handleExport(pending.format, { unit, samples: pending.samples }); }}>
                {t(`export.cadenceUnitOption.${unit}`)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

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
