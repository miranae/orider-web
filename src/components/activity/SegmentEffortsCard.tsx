import { useTranslation } from "react-i18next";
import { Card } from "../../theme/components";
import { isImplausibleAvgSpeed } from "../../utils/activitySanity";

export interface SegmentEffortData {
  id: number;
  name: string;
  elapsedTime: number;
  movingTime: number;
  distance: number;
  startIndex: number;
  endIndex: number;
  averageWatts: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageCadence: number | null;
  prRank: number | null;
  komRank: number | null;
  achievements: { type_id: number; type: string; rank: number }[];
  segment: {
    id: number;
    name: string;
    distance: number;
    averageGrade: number;
    maximumGrade: number;
    elevationHigh: number;
    elevationLow: number;
    climbCategory: number;
    starred: boolean;
  };
}

const CLIMB_CATEGORIES = ["", "4", "3", "2", "1", "HC"];

interface SegmentEffortsCardProps {
  efforts: SegmentEffortData[];
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  onHover: (effort: SegmentEffortData | null) => void;
  formatTime: (ms: number) => string;
}

export default function SegmentEffortsCard({
  efforts,
  showAll,
  setShowAll,
  onHover,
  formatTime,
}: SegmentEffortsCardProps) {
  const { t } = useTranslation("activity");
  const prCount = efforts.filter((e) => e.prRank != null && e.prRank <= 3).length;
  const komCount = efforts.filter((e) => e.komRank != null && e.komRank <= 10).length;
  const visible = showAll ? efforts : efforts.slice(0, 5);

  return (
    <Card id="segments" padding="none" className="overflow-hidden" style={{ padding: 0 }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--line-soft)" }}>
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-0)", marginBottom: "var(--space-1)" }}>{t("segments.title")}</h3>
          <div className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{t("segments.matched", { count: efforts.length })}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[length:var(--fs-xs)]">
          {prCount > 0 && (
            <span
              className="px-2 py-0.5 rounded-full font-bold text-[11px]"
              style={{ background: "color-mix(in srgb, var(--amber) 15%, transparent)", color: "var(--amber)", border: "1px solid color-mix(in srgb, var(--amber) 30%, transparent)" }}
            >
              PR {prCount}
            </span>
          )}
          {komCount > 0 && (
            <span
              className="px-2 py-0.5 rounded-full font-bold text-[11px]"
              style={{ background: "color-mix(in srgb, var(--lime) 15%, transparent)", color: "var(--lime)", border: "1px solid color-mix(in srgb, var(--lime) 30%, transparent)" }}
            >
              KOM {komCount}
            </span>
          )}
          {efforts.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="ml-2 text-[length:var(--fs-xs)] font-medium hover:underline"
              style={{ color: "var(--lime)" }}
            >
              {showAll ? t("segments.collapse") : t("segments.viewAll")}
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
          <thead>
            <tr style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-2xs)", letterSpacing: "0.08em" }}>
              <th style={{ textAlign: "left", padding: "10px 18px", fontWeight: 500 }}>{t("segments.header.name")}</th>
              <th style={{ textAlign: "right", padding: "10px 10px", fontWeight: 500 }}>{t("segments.header.distance")}</th>
              <th style={{ textAlign: "right", padding: "10px 10px", fontWeight: 500 }}>{t("segments.header.grade")}</th>
              <th style={{ textAlign: "right", padding: "10px 10px", fontWeight: 500 }}>{t("segments.header.time")}</th>
              <th style={{ textAlign: "right", padding: "10px 10px", fontWeight: 500 }}>{t("segments.header.speed")}</th>
              <th style={{ textAlign: "right", padding: "10px 18px", fontWeight: 500 }}>{t("segments.header.rank")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((effort) => {
              const seg = effort.segment;
              const cat = CLIMB_CATEGORIES[seg.climbCategory] || "";
              const isPR = effort.prRank != null && effort.prRank >= 1 && effort.prRank <= 3;
              const isKOM = effort.komRank != null && effort.komRank >= 1 && effort.komRank <= 10;
              const avgSpeed = effort.distance > 0 && effort.elapsedTime > 0
                ? (effort.distance / 1000) / (effort.elapsedTime / 3600000)
                : 0;

              return (
                <tr
                  key={effort.id}
                  className="transition-colors hover:bg-[var(--bg-2)] cursor-pointer"
                  style={{ borderTop: "1px solid var(--line-soft)" }}
                  onMouseEnter={() => onHover(effort)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => {
                    const segId = String(effort.segment.id).startsWith("strava_") ? effort.segment.id : `strava_${effort.segment.id}`;
                    window.location.href = `/segment/${segId}`;
                  }}
                >
                  <td style={{ padding: "12px 18px" }}>
                    <div className="flex items-center gap-2">
                      {cat && (
                        <span
                          className="text-[9px] font-bold px-1 py-0.5 rounded-[var(--r-sm)] leading-none flex-shrink-0"
                          style={
                            cat === "HC" ? { background: "var(--rose)", color: "var(--ink-0)" } :
                            cat === "1" ? { background: "color-mix(in oklch, var(--rose) 82%, var(--amber))", color: "var(--ink-0)" } :
                            cat === "2" ? { background: "var(--rose)", color: "var(--ink-0)" } :
                            cat === "3" ? { background: "var(--amber)", color: "var(--primary-fg)" } :
                            { background: "var(--bg-3)", color: "var(--ink-1)" }
                          }
                        >
                          {cat === "HC" ? "HC" : `C${cat}`}
                        </span>
                      )}
                      <span className="font-medium truncate" style={{ color: "var(--ink-0)" }}>{effort.name}</span>
                      {isPR && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            effort.prRank === 1
                              ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-yellow-900"
                              : effort.prRank === 2
                              ? "bg-gradient-to-r from-slate-300 to-slate-400 text-[var(--ink-0)]"
                              : "bg-gradient-to-r from-[var(--amber)] to-[var(--amber)] text-[var(--bg-0)]"
                          }`}
                        >
                          {effort.prRank === 1 ? "PR" : `${effort.prRank}nd`}
                        </span>
                      )}
                      {isKOM && (
                        <span className="text-[9px] font-bold bg-[var(--lime)] text-[var(--bg-0)] px-1.5 py-0.5 rounded-full flex-shrink-0">
                          KOM
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", padding: "12px 10px", color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>
                    {(seg.distance / 1000).toFixed(1)} km
                  </td>
                  <td style={{ textAlign: "right", padding: "12px 10px", color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>
                    {seg.averageGrade.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "right", padding: "12px 10px", color: "var(--ink-0)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    {formatTime(effort.elapsedTime)}
                  </td>
                  <td
                    style={{ textAlign: "right", padding: "12px 10px", color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}
                    title={isImplausibleAvgSpeed(avgSpeed, "bike") ? `데이터 이상 — 원본값 ${avgSpeed.toFixed(1)} km/h` : undefined}
                  >
                    {avgSpeed > 0
                      ? (isImplausibleAvgSpeed(avgSpeed, "bike") ? "—" : `${avgSpeed.toFixed(1)} km/h`)
                      : "-"}
                  </td>
                  <td style={{ textAlign: "right", padding: "12px 18px", color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>
                    {effort.komRank ? `#${effort.komRank}` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {efforts.length > 5 && !showAll && (
        <div className="px-4 py-2.5 text-center" style={{ borderTop: "1px solid var(--line-soft)" }}>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-[length:var(--fs-xs)] font-medium hover:underline"
            style={{ color: "var(--lime)" }}
          >
            {t("segments.moreCount", { count: efforts.length - 5 })}
          </button>
        </div>
      )}
    </Card>
  );
}
