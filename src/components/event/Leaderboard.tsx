import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

interface LocationData {
  uid: string;
  displayName: string;
  bib: number | null;
  category: string | null;
  overallRank: number | null;
  rank: number | null;
  lastCp: number | null;
  speed: number;
  distance: number;
  status: string;
}

interface LeaderboardProps {
  locations: LocationData[];
  highlightBib?: number | null;
}

export default function Leaderboard({ locations, highlightBib }: LeaderboardProps) {
  const { t } = useTranslation("event");
  const [activeTab, setActiveTab] = useState<string>("all");

  const categories = useMemo(() => {
    const cats = new Set(locations.map(l => l.category).filter(Boolean));
    return ["all", ...Array.from(cats)] as string[];
  }, [locations]);

  const filtered = useMemo(() => {
    const list = activeTab === "all"
      ? locations
      : locations.filter(l => l.category === activeTab);

    return [...list].sort((a, b) => {
      if (activeTab === "all") return (a.overallRank ?? 9999) - (b.overallRank ?? 9999);
      return (a.rank ?? 9999) - (b.rank ?? 9999);
    }).slice(0, 100); // Show top 100
  }, [locations, activeTab]);

  const tabLabel = (cat: string): string => {
    if (cat === "all") return t("filter.all");
    if (cat === "elite") return t("leaderboard.tab.elite");
    if (cat === "citizen") return t("leaderboard.tab.citizen");
    if (cat === "women") return t("leaderboard.tab.women");
    return cat;
  };

  return (
    <div>
      <h2 style={{ fontSize: "18px", marginBottom: "var(--space-3)" }}>{t("leaderboard.title")}</h2>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "var(--space-1)", marginBottom: "var(--space-3)" }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            style={{
              padding: "6px 16px",
              border: "none",
              borderRadius: "20px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === cat ? "bold" : "normal",
              background: activeTab === cat ? "#1976d2" : "#f0f0f0",
              color: activeTab === cat ? "white" : "#333",
            }}
          >
            {tabLabel(cat)}
          </button>
        ))}
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--bg-3)" }}>
            <th style={{ textAlign: "center", padding: "var(--space-2)", width: "50px" }}>{t("rank")}</th>
            <th style={{ textAlign: "left", padding: "var(--space-2)" }}>{t("bibNumber")}</th>
            <th style={{ textAlign: "left", padding: "var(--space-2)" }}>{t("realName")}</th>
            <th style={{ textAlign: "center", padding: "var(--space-2)" }}>CP</th>
            <th style={{ textAlign: "right", padding: "var(--space-2)" }}>{t("distance")}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(loc => {
            const rank = activeTab === "all" ? loc.overallRank : loc.rank;
            const isHighlighted = highlightBib != null && loc.bib === highlightBib;
            return (
              <tr
                key={loc.uid}
                style={{
                  borderBottom: "1px solid var(--bg-3)",
                  backgroundColor: isHighlighted ? "#fff3e0" : "transparent",
                  fontWeight: isHighlighted ? "bold" : "normal",
                }}
              >
                <td style={{ textAlign: "center", padding: "var(--space-2)" }}>{rank ?? "-"}</td>
                <td style={{ padding: "var(--space-2)" }}>#{loc.bib ?? "-"}</td>
                <td style={{ padding: "var(--space-2)" }}>{loc.displayName}</td>
                <td style={{ textAlign: "center", padding: "var(--space-2)" }}>CP{loc.lastCp ?? 0}</td>
                <td style={{ textAlign: "right", padding: "var(--space-2)" }}>
                  {(loc.distance / 1000).toFixed(1)} km
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
