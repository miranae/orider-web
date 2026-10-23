import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Text, buttonClass } from "../../../theme/components";

/** 로컬 활동 기록으로만 복귀하며 선택한 비교 맥락을 그대로 보존한다. */
export default function PlanComparisonReturn() {
  const { state } = useLocation();
  const { t } = useTranslation("training");
  const target = state?.comparisonReturn;
  if (!target || typeof target.pathname !== "string"
    || !/^\/(?:ko\/|en\/)?athlete\/me\/activities$/.test(target.pathname)
    || typeof target.search !== "string" || typeof target.hash !== "string") return null;
  return <aside className="site-shell">
    <Text as="p" variant="bodySmall" tone="secondary">{t("planRecords.reviewContext")}</Text>
    <LocalizedLink to={target} className={buttonClass({ variant: "secondary", size: "sm" })}>{t("planRecords.returnComparison")}</LocalizedLink>
  </aside>;
}
