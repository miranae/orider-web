import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../LocalizedLink";
import { buttonClass } from "../../theme/components";

interface TodayPlanLinkProps {
  discipline?: "bike" | "run" | "swim";
}

export default function TodayPlanLink({ discipline }: TodayPlanLinkProps) {
  const { t } = useTranslation("training");
  const to = discipline
    ? { pathname: "/plan", search: `?sport=${discipline}` }
    : "/plan";

  return (
    <LocalizedLink
      to={to}
      className={buttonClass({ variant: "ghost", size: "sm" })}
    >
      {t("today.viewTodayPlan")}
      <ChevronRight size={16} aria-hidden="true" />
    </LocalizedLink>
  );
}
