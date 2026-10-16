import { useTranslation } from "react-i18next";
import InfoTip from "../../../components/InfoTip";
import type { DailyLoad } from "../../../utils/fitnessMetrics";
import "./DailyTSSChart.css";

export default function DailyTSSChart({ data }: { data: DailyLoad[] }) {
  const { t } = useTranslation("training");
  const recent = data.slice(-42);
  const maxLoad = Math.max(...recent.map((day) => day.totalLoad), 1);
  return <div className="daily-load-chart">
    {recent.map((day) => {
      const value = day.totalLoad;
      const unknown = !!day.unknownCount && day.activities.length === 0 && value === 0;
      const label = `${unknown ? "–" : Math.round(value)} TSS`;
      const color = unknown ? "var(--ink-3)" : value === 0 ? "var(--bg-3)" :
        value < 100 ? "var(--aqua-dim)" : value < 200 ? "var(--lime-dim)" : value < 300 ? "var(--amber)" : "var(--rose)";
      return <InfoTip key={day.date} title={day.date} label={`${day.date} · ${label}${day.unknownCount ? ` · ${t("log.loadPartial", { count: day.unknownCount })}` : ""}`}
        content={`${label}${day.unknownCount ? ` · ${t("log.loadPartial", { count: day.unknownCount })}` : ""}`}
        className="daily-load-chart__target">
        <span aria-hidden="true" className={unknown ? "daily-load-chart__bar daily-load-chart__bar--unknown" : "daily-load-chart__bar"}
          data-load-status={unknown ? "unknown" : "known"}
          style={{ height: unknown ? "100%" : `${Math.max(value / maxLoad * 100, 4)}%`, backgroundColor: color }} />
      </InfoTip>;
    })}
  </div>;
}
