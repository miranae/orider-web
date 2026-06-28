import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import WeekBars from "./WeekBars";
import { Card, Text } from "../../theme/components";

interface WeekEntry {
  label: string;  // "1/13" 등 주간 라벨
  distance: number; // km
}

interface WeeklySummaryCardProps {
  distance: string;
  duration: string;
  rideCount: number;
  elevation: string;
  recentWeeks: WeekEntry[];
}

export default function WeeklySummaryCard({ distance, duration, rideCount, elevation, recentWeeks }: WeeklySummaryCardProps) {
  const { t } = useTranslation("dashboard");
  const stats = [
    { label: t("weeklySummary.distance"), value: distance, unit: "km" },
    { label: t("weeklySummary.time"), value: duration, unit: "" },
    { label: t("weeklySummary.activities"), value: String(rideCount), unit: t("weeklySummary.ridesUnit") },
    { label: t("home.sidebarMy.elev"), value: elevation, unit: "m" },
  ];

  return (
    <div className="md:hidden" style={{ borderBottom: "1px solid var(--line-soft)", padding: "14px 16px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-3)' }}>
        <Text variant="eyebrow">{t("weeklySummary.title")}</Text>
        <Link to="/my" style={{ fontSize: "var(--fs-xs)", color: "var(--lime)", fontWeight: 500, textDecoration: "none" }}>
          {t("weeklySummary.viewAll")}
        </Link>
      </div>

      {/* 4-column stat grid */}
      <Card padding="none" className="grid grid-cols-4 overflow-hidden"
        style={{ marginBottom: 'var(--space-3)', padding: 0 }}
      >
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "10px var(--space-2)",
              textAlign: "center",
              borderRight: i < 3 ? "1px solid var(--line-soft)" : "none",
            }}
          >
            {/* 라벨 위 / 값 아래 — ActivityCard 와 동일 세로 스택 (가독성) */}
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: "var(--space-1)" }}>{s.label}</div>
            <Text as="div" variant="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", lineHeight: 1 }}>
              {s.value}
              <span style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-4)", marginLeft: 1 }}>{s.unit}</span>
            </Text>
          </div>
        ))}
      </Card>

      {/* Weekly bar chart */}
      <Card padding="none" style={{ padding: "var(--space-3)" }}>
        <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>{t("weeklySummary.weeklyDistanceKm")}</Text>
        <WeekBars weeks={recentWeeks} />
      </Card>
    </div>
  );
}
