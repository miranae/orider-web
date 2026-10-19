import { useTranslation } from "react-i18next";
import "./ConditionSectionNav.css";
import { buttonClass } from "../../../theme/components";

export interface ConditionSectionLink { id: string; label: string }
/** A reading map for the open page; links never unmount or reset the evidence. */
export default function ConditionSectionNav({ sections }: { sections: readonly ConditionSectionLink[] }) {
  const { t } = useTranslation("fitness");
  if (!sections.length) return null;
  return <nav className="condition-section-nav" aria-label={t("condition.sections.label")}>
    <span className="condition-section-nav__label sr-only">{t("condition.sections.label")}</span>
    <ol>{sections.map(section => <li key={section.id}><a className={buttonClass({ variant: "ghost", size: "sm" })} href={`#${section.id}`}>{section.label}<span aria-hidden="true"> ↘</span></a></li>)}</ol>
  </nav>;
}
