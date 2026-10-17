import { useTranslation } from "react-i18next";
import InfoTip from "../../components/InfoTip";

const labels: Record<number, string> = { 5: "HC", 4: "Cat 1", 3: "Cat 2", 2: "Cat 3", 1: "Cat 4" };
export default function SegmentClimbCategory({ category }: { category: number }) {
  const { t } = useTranslation("segment");
  const label = labels[category];
  if (!label) return null;
  return <span className="segment-category-badge"><InfoTip title={t("climb.explanationTitle")} content={t("climb.explanation")} label={t("climb.explanationLabel", { category: label })}>{label}</InfoTip></span>;
}
