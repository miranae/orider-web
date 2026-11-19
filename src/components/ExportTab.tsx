import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity, ActivityStreams } from "@shared/types";
import { prepareTcxExport, type TcxLapMode } from "../utils/exportTcx";
import { generateCsv } from "../utils/exportCsv";
import { generateFit } from "../utils/exportFit";
import { generateGpx } from "../utils/exportGpx";
import { prepareActivityFileStreams } from "../utils/prepareActivityFileStreams";
import { exportFilename, exportSportOf } from "../utils/exportSport";
import { useToast } from "../contexts/ToastContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { readStreamCadenceUnit, readVerifiedStreamRevision } from "../services/activityStreamSource";
import { reportPreviousAccountFailure, logClientError } from "../services/errorLogger";

interface ExportTabProps {
  activity: Activity;
  streams: ActivityStreams;
  resolveCurrentStreams?: (format: string) => Promise<ActivityStreams>;
  getExportAccount?: () => object | null;
  authorizationScope?: object;
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

type CadenceChoice = "spm" | "strides_per_minute" | "omit";
type TcxChoice = TcxLapMode | "csv";

export default function ExportTab({ activity, streams, resolveCurrentStreams, getExportAccount, authorizationScope }: ExportTabProps) {
  const { t } = useTranslation("activity");
  const { showToast } = useToast();
  const firebaseServices = useFirebaseServices();
  const renderedAccount = getExportAccount?.();
  const activityScope = JSON.stringify([activity.id, activity.userId, activity.startTime, activity.type, activity.source, activity.visibility,
    (activity as Activity & { activityRevision?: unknown }).activityRevision, activity.contentSelectedRevision, activity.activityPresentationV1?.sensorOriginActivityId]);
  const resolverScope = authorizationScope ?? resolveCurrentStreams;
  const [cadencePrompts, setCadencePrompts] = useState<Partial<Record<"fit" | "tcx", {
    activityScope: string;
    streams: ActivityStreams;
    account: typeof renderedAccount;
    resolverScope: object | undefined;
    format: "fit" | "tcx";
    samples: NonNullable<ActivityStreams["cadence"]>;
    time: ActivityStreams["time"];
    revision: string | undefined;
  }>>>({});
  const visibleCadencePrompts = Object.values(cadencePrompts).filter(prompt => prompt?.activityScope === activityScope
    && prompt.streams === streams && prompt.account === renderedAccount && prompt.resolverScope === resolverScope);
  const [tcxPrompt, setTcxPrompt] = useState<{
    activityScope: string;
    streams: ActivityStreams;
    account: typeof renderedAccount;
    resolverScope: object | undefined;
    cadenceChoice: CadenceChoice | undefined;
    binding: string;
    canExportAllAsTcx: boolean;
  } | null>(null);
  const pendingTcx = tcxPrompt?.activityScope === activityScope && tcxPrompt.streams === streams
    && tcxPrompt.account === renderedAccount && tcxPrompt.resolverScope === resolverScope ? tcxPrompt : null;
  const generation = useRef(0);
  const latestActivity = useRef(activity);
  useLayoutEffect(() => { latestActivity.current = activity; }, [activity]);
  const formatRequests = useRef(new Map<string, number>());
  useLayoutEffect(() => { generation.current++; return () => { generation.current++; }; }, [activityScope, streams, resolverScope, getExportAccount]);

  const handleExport = useCallback(async (format: string, choice?: CadenceChoice, tcxMode?: TcxChoice) => {
    const account = getExportAccount?.();
    if (account !== renderedAccount) return;
    const scope = generation.current;
    const request = (formatRequests.current.get(format) ?? 0) + 1;
    formatRequests.current.set(format, request);
    const stillCurrent = () => scope === generation.current && formatRequests.current.get(format) === request
      && getExportAccount?.() === account;
    const sensorFormat = format === "fit" || format === "tcx" ? format : null;
    const pendingCadence = sensorFormat ? cadencePrompts[sensorFormat] : undefined;
    const clearCadencePrompt = () => {
      if (sensorFormat && pendingCadence) setCadencePrompts(current => ({ ...current, [sensorFormat]: undefined }));
    };
    try {
      const currentStreams = resolveCurrentStreams ? await resolveCurrentStreams(format) : streams;
      if (!stillCurrent()) return;
      const fileActivity = latestActivity.current;
      const verifiedUnit = readStreamCadenceUnit(currentStreams);
      const cadence = currentStreams.cadence;
      const time = currentStreams.time;
      const revision = readVerifiedStreamRevision(currentStreams);
      const missingFootCadenceUnit = (format === "fit" || format === "tcx") && exportSportOf(fileActivity).footCadence
        && verifiedUnit !== "spm" && verifiedUnit !== "strides_per_minute"
        && Array.isArray(cadence) && cadence.some(value => Number.isFinite(value) && value >= 0);
      const chosenUnitApplies = choice === "omit" || (choice !== undefined && pendingCadence?.format === format
        && revision === pendingCadence.revision && time?.length === pendingCadence.time?.length
        && (!time || time.every((value, index) => Object.is(value, pendingCadence.time?.[index])))
        && cadence?.length === pendingCadence.samples.length && cadence?.every((value, index) => Object.is(value, pendingCadence.samples[index])));
      if (missingFootCadenceUnit && !chosenUnitApplies) {
        if (format === "tcx") setTcxPrompt(null);
        setCadencePrompts(current => ({ ...current, [format]: {
          activityScope, streams, account, resolverScope, format, samples: [...cadence], time: time?.slice(), revision,
        } }));
        return;
      }
      const fileCadenceUnit = choice === "omit" ? undefined : missingFootCadenceUnit ? choice : verifiedUnit;
      const fileStreams = choice === "omit" ? { ...currentStreams, cadence: undefined } : currentStreams;
      switch (format) {
        case "fit": {
          clearCadencePrompt();
          const data = generateFit(fileActivity, prepareActivityFileStreams(fileActivity, fileStreams, format), fileCadenceUnit);
          const ab = new ArrayBuffer(data.byteLength);
          new Uint8Array(ab).set(data);
          downloadBlob(new Blob([ab], { type: "application/octet-stream" }), exportFilename(fileActivity, "fit"));
          break;
        }
        case "tcx": {
          const preparedStreams = prepareActivityFileStreams(fileActivity, fileStreams, format);
          const prepared = prepareTcxExport(fileActivity, preparedStreams, fileCadenceUnit);
          if (prepared.hasUnassigned || tcxMode) {
            const binding = JSON.stringify([revision, preparedStreams.laps, preparedStreams.time, preparedStreams.latlng,
              preparedStreams.distance, preparedStreams.altitude, preparedStreams.velocity_smooth, preparedStreams.heartrate,
              preparedStreams.cadence, preparedStreams.watts, fileCadenceUnit, fileActivity.summary.distance,
              fileActivity.summary.ridingTimeMillis, fileActivity.summary.elapsedTimeMillis, fileActivity.endTime]);
            if (!tcxMode || pendingTcx?.binding !== binding) {
              setTcxPrompt({ activityScope, streams, account, resolverScope, cadenceChoice: choice, binding,
                canExportAllAsTcx: prepared.canExportAllAsTcx });
              return;
            }
          }
          clearCadencePrompt();
          setTcxPrompt(null);
          if (tcxMode === "csv") {
            downloadBlob(new Blob([generateCsv(preparedStreams)], { type: "text/csv" }), exportFilename(fileActivity, "csv"));
          } else {
            const xml = prepared.render(tcxMode ?? "recorded");
            downloadBlob(new Blob([xml], { type: "application/xml" }), exportFilename(fileActivity, "tcx"));
          }
          break;
        }
        case "csv": {
          const csv = generateCsv(currentStreams);
          downloadBlob(new Blob([csv], { type: "text/csv" }), exportFilename(fileActivity, "csv"));
          break;
        }
        case "gpx": {
          const gpx = generateGpx(fileActivity, currentStreams);
          if (gpx) {
            downloadBlob(new Blob([gpx], { type: "application/gpx+xml" }), exportFilename(fileActivity, "gpx"));
          }
          break;
        }
      }
    } catch (err) {
      if (getExportAccount?.() !== account) {
        reportPreviousAccountFailure("ExportTab.previousAccount", err, { format });
        return;
      }
      logClientError("ExportTab.export", err, { activityId: activity.id, format }, firebaseServices);
      if (stillCurrent()) {
        clearCadencePrompt();
        if (format === "tcx") setTcxPrompt(null);
        showToast(t("export.errorAlert"), "error");
      }
    }
  }, [activity, activityScope, streams, resolveCurrentStreams, resolverScope, getExportAccount, renderedAccount,
    cadencePrompts, pendingTcx, firebaseServices, t, showToast]);

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

      {pendingTcx && (
        <fieldset className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-4">
          <legend className="font-semibold">{t("export.tcxLapsTitle")}</legend>
          <p className="text-[length:var(--fs-sm)]">{t(pendingTcx.canExportAllAsTcx ? "export.tcxLapsHelp" : "export.tcxLapsMissingTotals")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["recorded", pendingTcx.canExportAllAsTcx ? "activity" : "csv"] as const).map(mode => (
              <button key={mode} type="button" className="rounded-[var(--r-md)] border border-[var(--line-soft)] px-3 py-2"
                onClick={() => { void handleExport("tcx", pendingTcx.cadenceChoice, mode); }}>
                {t(`export.tcxLapsChoice.${mode}`)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {visibleCadencePrompts.filter(prompt => prompt?.format !== "tcx" || !pendingTcx).map(prompt => prompt && (
        <fieldset key={prompt.format} className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-4">
          <legend className="font-semibold">{t("export.cadenceUnitTitle")} · {prompt.format.toUpperCase()}</legend>
          <p className="text-[length:var(--fs-sm)]">{t("export.cadenceUnitHelp")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["spm", "strides_per_minute", "omit"] as const).map(choice => (
              <button key={choice} type="button" className="rounded-[var(--r-md)] border border-[var(--line-soft)] px-3 py-2"
                onClick={() => { void handleExport(prompt.format, choice); }}>
                {t(`export.cadenceChoice.${choice}`)}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

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
