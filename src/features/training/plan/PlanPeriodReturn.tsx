import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Text, buttonClass } from "../../../theme/components";

/** 기간 집계와 개별 연결 근거의 의미를 유지하며 원래 비교 조건으로 복귀한다. */
export default function PlanPeriodReturn() {
  const location = useLocation();
  const { t } = useTranslation("training");
  const target = location.state?.periodReturn;
  if (!target || typeof target.pathname !== "string" || !/^\/(?:ko\/|en\/)?coach\/plan$/.test(target.pathname)
    || typeof target.search !== "string" || typeof target.hash !== "string"
    || target.pathname === location.pathname && target.search === location.search) return null;
  return <aside>
    <Text as="p" variant="bodySmall" tone="secondary">{t("loadComparison.separateLink")}</Text>
    <LocalizedLink className={buttonClass({ variant: "secondary", size: "sm" })} to={target}>{t("loadComparison.returnPeriod")}</LocalizedLink>
  </aside>;
}
