import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface LocationData {
  uid: string;
  lat: number;
  lng: number;
  speed: number;
  distance: number;
  status: string;
  displayName: string;
  bib: number | null;
  category: string | null;
  rank: number | null;
  overallRank: number | null;
  lastCp: number | null;
  geohash: string | null;
}

interface ParticipantTableProps {
  locations: LocationData[];
  selectedUid: string | null;
  onSelectParticipant: (uid: string) => void;
}

const STATUS_KEYS: Record<string, string> = {
  RIDING: "liveView.riding",
  FINISHED: "stats.finished",
  SOS: "SOS",
  DNF: "DNF",
  OFF_COURSE: "dashboard.status.offCourse",
  LOST_SIGNAL: "participantTable.status.lostSignal",
};

const STATUS_COLORS: Record<string, string> = {
  RIDING: "var(--lime)",
  FINISHED: "var(--aqua)",
  SOS: "var(--rose)",
  DNF: "var(--ink-3)",
  OFF_COURSE: "var(--amber)",
  LOST_SIGNAL: "var(--ink-3)",
};

const STATUS_EMOJIS: Record<string, string> = {
  RIDING: "🟢",
  FINISHED: "🏁",
  SOS: "🆘",
  DNF: "❌",
  OFF_COURSE: "🟠",
  LOST_SIGNAL: "⬛",
};

const RIGHT_ALIGN_IDX = new Set([0, 1, 5, 6, 7]);

export default function ParticipantTable({
  locations,
  selectedUid,
  onSelectParticipant,
}: ParticipantTableProps) {
  const { t } = useTranslation("event");
  const [search, setSearch] = useState("");

  const HEADERS = [
    t("rank"),
    t("bibNumber"),
    t("realName"),
    t("field.category"),
    t("participantsView.colStatus"),
    t("distance"),
    t("participantTable.col.speed"),
    "CP",
  ] as const;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locations
      .filter((loc) => {
        if (!q) return true;
        const matchBib = loc.bib != null && String(loc.bib).includes(q);
        const matchName = loc.displayName.toLowerCase().includes(q);
        return matchBib || matchName;
      })
      .sort((a, b) => (a.overallRank ?? 9999) - (b.overallRank ?? 9999));
  }, [locations, search]);

  const getStatusLabel = (status: string): string => {
    const key = (status || "").toUpperCase();
    const i18nKey = STATUS_KEYS[key];
    if (!i18nKey) return status;
    // SOS and DNF are proper nouns / abbreviations — return as-is
    if (i18nKey === "SOS" || i18nKey === "DNF") return i18nKey;
    return t(i18nKey);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search row */}
      <div
        className="flex items-center"
        style={{ gap: 'var(--space-2)', padding: "8px 14px", borderBottom: "1px solid var(--line-soft)", flexShrink: 0 }}
      >
        <input
          type="text"
          placeholder={t("participantTable.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "6px 10px",
            background: "var(--bg-2)",
            border: "1px solid var(--line-soft)",
            borderRadius: "var(--r-sm, 4px)",
            color: "var(--ink-0)",
            fontSize: "var(--fs-xs)",
            width: 180,
          }}
        />
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>
          {filtered.length} / {locations.length}{t("detail.unit.person")}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg-2)", zIndex: 1 }}>
            <tr>
              {HEADERS.map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: RIGHT_ALIGN_IDX.has(i) ? "right" : "left",
                    padding: "10px 14px",
                    fontSize: "var(--fs-2xs)",
                    letterSpacing: "0.06em",
                    color: "var(--ink-3)",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((loc) => {
              const statusKey = (loc.status || "").toUpperCase();
              const color = STATUS_COLORS[statusKey] ?? "var(--ink-3)";
              const emoji = STATUS_EMOJIS[statusKey] ?? "·";
              const label = getStatusLabel(loc.status);
              const sel = loc.uid === selectedUid;
              const distKm = loc.distance / 1000;
              return (
                <tr
                  key={loc.uid}
                  onClick={() => onSelectParticipant(loc.uid)}
                  style={{
                    cursor: "pointer",
                    borderBottom: "1px solid var(--line-soft)",
                    background: sel ? "color-mix(in oklch, var(--lime) 6%, transparent)" : "transparent",
                  }}
                >
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      color: loc.overallRank ? "var(--ink-0)" : "var(--ink-3)",
                      fontWeight: loc.overallRank ? 500 : 400,
                    }}
                  >
                    {loc.overallRank ?? "–"}
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ink-1)" }}>
                    {loc.bib != null ? `#${String(loc.bib).padStart(3, "0")}` : "–"}
                  </td>
                  <td style={{ padding: "9px 14px", color: "var(--ink-0)" }}>{loc.displayName}</td>
                  <td style={{ padding: "9px 14px", color: "var(--ink-3)" }}>{loc.category ?? "–"}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "var(--space-1)",
                        color,
                        fontSize: "var(--fs-xs)",
                        fontWeight: 500,
                      }}
                    >
                      <span aria-hidden="true">{emoji}</span> {label}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
                    {distKm.toFixed(1)} km
                  </td>
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      color: loc.speed > 0 ? "var(--ink-2)" : "var(--ink-3)",
                    }}
                  >
                    {loc.speed > 0 ? loc.speed.toFixed(1) : "–"}
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>
                    CP{loc.lastCp ?? 0}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={HEADERS.length} style={{ padding: 'var(--space-6)', textAlign: "center", color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>
                  {t("empty.noParticipants")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
