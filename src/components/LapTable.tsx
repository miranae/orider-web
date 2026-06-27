import { useTranslation } from "react-i18next";
import type { LapData } from "@shared/types";
import { useLocale } from "../contexts/LocaleContext";
import { formatDistance, formatSpeed } from "../utils/units";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface LapTableProps {
  laps: LapData[];
}

export default function LapTable({ laps }: LapTableProps) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  if (laps.length === 0) {
    return (
      <div className="text-center py-8 text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>
        {t("lapTable.empty")}
      </div>
    );
  }

  // 합계/평균 계산
  const totalDistance = laps.reduce((s, l) => s + l.distanceKm, 0);
  const totalDuration = laps.reduce((s, l) => s + l.durationMs, 0);
  const avgSpeed = totalDuration > 0 ? (totalDistance / (totalDuration / 3600000)) : 0;
  const maxSpeed = Math.max(...laps.map((l) => l.maxSpeed));
  const avgCadence = laps.length > 0 ? Math.round(laps.reduce((s, l) => s + l.avgCadence, 0) / laps.length) : 0;
  const avgHr = laps.length > 0 ? Math.round(laps.reduce((s, l) => s + l.avgHeartRate, 0) / laps.length) : 0;
  const avgPower = laps.length > 0 ? Math.round(laps.reduce((s, l) => s + l.avgPower, 0) / laps.length) : 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[length:var(--fs-sm)]">
        <thead>
          <tr className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ borderBottom: '1px solid var(--line-soft)', color: 'var(--ink-3)' }}>
            <th className="text-left py-2 px-2">{t("lapTable.header.lap")}</th>
            <th className="text-right py-2 px-2">{t("lapTable.header.distance")}</th>
            <th className="text-right py-2 px-2">{t("lapTable.header.time")}</th>
            <th className="text-right py-2 px-2">{t("lapTable.header.avgSpeed")}</th>
            <th className="text-right py-2 px-2">{t("lapTable.header.maxSpeed")}</th>
            <th className="text-right py-2 px-2">{t("lapTable.header.cadence")}</th>
            <th className="text-right py-2 px-2">{t("lapTable.header.hr")}</th>
            <th className="text-right py-2 px-2">{t("lapTable.header.power")}</th>
          </tr>
        </thead>
        <tbody style={{ borderColor: 'var(--line-soft)' }}>
          {laps.map((lap) => (
            <tr key={lap.number} style={{ borderBottom: '1px solid var(--line-soft)' }} className="hover:bg-white/5">
              <td className="py-2 px-2 font-medium">{lap.number}</td>
              <td className="py-2 px-2 text-right tabular-nums">{formatDistance(lap.distanceKm * 1000, units)}</td>
              <td className="py-2 px-2 text-right tabular-nums font-mono">{formatDuration(lap.durationMs)}</td>
              <td className="py-2 px-2 text-right tabular-nums">{formatSpeed(lap.avgSpeed / 3.6, units, 'bike')}</td>
              <td className="py-2 px-2 text-right tabular-nums">{formatSpeed(lap.maxSpeed / 3.6, units, 'bike')}</td>
              <td className="py-2 px-2 text-right tabular-nums">{lap.avgCadence ? Math.round(lap.avgCadence) : "-"}</td>
              <td className="py-2 px-2 text-right tabular-nums">{lap.avgHeartRate ? Math.round(lap.avgHeartRate) : "-"}</td>
              <td className="py-2 px-2 text-right tabular-nums">{lap.avgPower ? Math.round(lap.avgPower) : "-"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-[length:var(--fs-xs)]" style={{ borderTop: '2px solid var(--line)' }}>
            <td className="py-2 px-2">{t("lapTable.total")}</td>
            <td className="py-2 px-2 text-right tabular-nums">{formatDistance(totalDistance * 1000, units)}</td>
            <td className="py-2 px-2 text-right tabular-nums font-mono">{formatDuration(totalDuration)}</td>
            <td className="py-2 px-2 text-right tabular-nums">{formatSpeed(avgSpeed / 3.6, units, 'bike')}</td>
            <td className="py-2 px-2 text-right tabular-nums">{formatSpeed(maxSpeed / 3.6, units, 'bike')}</td>
            <td className="py-2 px-2 text-right tabular-nums">{avgCadence || "-"}</td>
            <td className="py-2 px-2 text-right tabular-nums">{avgHr || "-"}</td>
            <td className="py-2 px-2 text-right tabular-nums">{avgPower || "-"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
