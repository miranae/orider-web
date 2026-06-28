import { useTranslation } from "react-i18next";
import type { SegmentEffort } from "@shared/types";
import Avatar from "./Avatar";
import { isImplausibleAvgSpeed } from "../utils/activitySanity";

interface LeaderboardTableProps {
  efforts: SegmentEffort[];
  highlightUserId?: string;
}

const RANK_BADGES = ["🥇", "🥈", "🥉"];

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function LeaderboardTable({
  efforts,
  highlightUserId,
}: LeaderboardTableProps) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="rounded-[var(--r-lg)] overflow-hidden" style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)' }}>
      <table className="w-full text-[length:var(--fs-sm)]">
        <thead>
          <tr style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line-soft)', color: 'var(--ink-2)' }}>
            <th className="text-left px-4 py-3 font-medium w-14">{t("leaderboard.colRank")}</th>
            <th className="text-left px-4 py-3 font-medium">{t("leaderboard.colRider")}</th>
            <th className="text-right px-4 py-3 font-medium">{t("leaderboard.colTime")}</th>
            <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">
              {t("leaderboard.colSpeed")}
            </th>
            <th className="text-right px-4 py-3 font-medium hidden md:table-cell">
              {t("leaderboard.colHr")}
            </th>
            <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">
              {t("leaderboard.colPower")}
            </th>
            <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">
              {t("leaderboard.colDate")}
            </th>
          </tr>
        </thead>
        <tbody>
          {efforts.map((e, i) => {
            const isHighlighted = e.userId === highlightUserId;
            return (
              <tr
                key={e.id}
                style={{
                  borderBottom: '1px solid var(--line-soft)',
                  background: isHighlighted ? 'color-mix(in srgb, var(--lime) 6%, transparent)' : undefined,
                }}
                className="last:border-0"
              >
                <td className="px-4 py-3 font-medium">
                  {i < 3 ? (
                    <span className="text-[length:var(--fs-lg)]">{RANK_BADGES[i]}</span>
                  ) : (
                    <span style={{ color: 'var(--ink-3)' }}>{i + 1}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={e.nickname} imageUrl={e.profileImage} size="sm" userId={e.userId} />
                    <span
                      className="font-medium"
                      style={isHighlighted ? { color: 'var(--lime)' } : { color: 'var(--ink-1)' }}
                    >
                      {e.nickname}
                    </span>
                  </div>
                </td>
                <td className="text-right px-4 py-3 font-mono font-medium" style={{ color: 'var(--ink-0)' }}>
                  {formatTime(e.elapsedTime)}
                </td>
                <td
                  className="text-right px-4 py-3 hidden sm:table-cell"
                  style={{ color: 'var(--ink-2)' }}
                  title={isImplausibleAvgSpeed(e.averageSpeed, "bike") ? `데이터 이상 — 원본값 ${e.averageSpeed.toFixed(1)} km/h` : undefined}
                >
                  {isImplausibleAvgSpeed(e.averageSpeed, "bike") ? "—" : `${e.averageSpeed.toFixed(1)} km/h`}
                </td>
                <td className="text-right px-4 py-3 hidden md:table-cell" style={{ color: 'var(--rose)' }}>
                  {e.averageHeartRate ?? "-"}
                </td>
                <td className="text-right px-4 py-3 hidden sm:table-cell" style={{ color: 'var(--aqua)' }}>
                  {e.averagePower ? `${e.averagePower}W` : "-"}
                </td>
                <td className="text-right px-4 py-3 hidden lg:table-cell" style={{ color: 'var(--ink-3)' }}>
                  {new Date(e.recordedAt).toLocaleDateString("ko-KR")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
