import { useTranslation } from "react-i18next";
import type { GroupLeaderboardEntry, GroupLeaderboardMetric } from "@shared/types";
import Avatar from "../Avatar";

interface GroupLeaderboardTableProps {
  entries: GroupLeaderboardEntry[];
  metric: GroupLeaderboardMetric;
  highlightUserId?: string;
}

const RANK_BADGES = ["🥇", "🥈", "🥉"];

export default function GroupLeaderboardTable({
  entries,
  metric,
  highlightUserId,
}: GroupLeaderboardTableProps) {
  const { t } = useTranslation("group");

  return (
    <div
      className="rounded-[var(--r-lg)] overflow-hidden"
      style={{ background: "var(--bg-1)", border: "1px solid var(--line-soft)" }}
    >
      <table className="w-full text-[length:var(--fs-sm)]">
        <thead>
          <tr style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--line-soft)", color: "var(--ink-2)" }}>
            <th className="text-left px-4 py-3 font-medium w-14">{t("leaderboard.table.rank")}</th>
            <th className="text-left px-4 py-3 font-medium">{t("leaderboard.table.rider")}</th>
            <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">{t("leaderboard.table.ftp")}</th>
            <th
              className="text-right px-4 py-3 font-medium"
              style={metric === "ftp_per_kg" ? { color: "var(--ink-0)" } : undefined}
            >
              {t("leaderboard.table.wkg")}
            </th>
            <th
              className="text-right px-4 py-3 font-medium"
              style={metric === "weekly_wtss" ? { color: "var(--ink-0)" } : undefined}
            >
              {t("leaderboard.table.weeklyTss")}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const isHighlighted = e.userId === highlightUserId;
            return (
              <tr
                key={e.userId}
                style={{
                  borderBottom: "1px solid var(--line-soft)",
                  background: isHighlighted ? "color-mix(in oklch, var(--lime) 6%, transparent)" : undefined,
                }}
                className="last:border-0"
              >
                <td className="px-4 py-3 font-medium">
                  {i < 3 ? (
                    <span className="text-[length:var(--fs-lg)]">{RANK_BADGES[i]}</span>
                  ) : (
                    <span style={{ color: "var(--ink-3)" }}>{e.rank}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={e.nickname} imageUrl={e.photoURL} size="sm" userId={e.userId} />
                    <span
                      className="font-medium truncate"
                      style={isHighlighted ? { color: "var(--lime)" } : { color: "var(--ink-1)" }}
                    >
                      {e.nickname}
                    </span>
                  </div>
                </td>
                <td className="text-right px-4 py-3 font-mono hidden sm:table-cell" style={{ color: "var(--ink-2)" }}>
                  {e.ftp != null ? `${e.ftp}W` : "—"}
                </td>
                <td
                  className="text-right px-4 py-3 font-mono font-medium"
                  style={{ color: metric === "ftp_per_kg" ? "var(--ink-0)" : "var(--ink-2)" }}
                >
                  {e.ftpPerKg != null ? e.ftpPerKg.toFixed(2) : "—"}
                </td>
                <td
                  className="text-right px-4 py-3 font-mono font-medium"
                  style={{ color: metric === "weekly_wtss" ? "var(--ink-0)" : "var(--ink-2)" }}
                >
                  {e.weeklyTss != null ? Math.round(e.weeklyTss) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
