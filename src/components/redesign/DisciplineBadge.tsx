import { Bike, Footprints, Waves } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDisciplineColor, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import type { Discipline } from "../../utils/disciplineFilter";

interface DisciplineBadgeProps {
  discipline: Discipline;
}

export default function DisciplineBadge({ discipline }: DisciplineBadgeProps) {
  const { t } = useTranslation("common");
  const color = getDisciplineColor(discipline);
  const label = t(getDisciplineLabelKey(discipline));
  const Icon = discipline === "bike" ? Bike : discipline === "run" ? Footprints : Waves;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 'var(--space-1)',
      padding: "2px 8px", borderRadius: "var(--r-lg)", fontSize: "var(--fs-2xs)", fontWeight: 500,
      background: `color-mix(in oklch, ${color} 10%, var(--bg-2))`,
      color, border: `1px solid color-mix(in oklch, ${color} 25%, transparent)`,
    }}>
      <Icon size={11} /> {label}
    </span>
  );
}
