import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../LocalizedLink";
import { buttonClass } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

interface TodayPlanLinkProps {
  discipline?: "bike" | "run" | "swim";
}

export default function TodayPlanLink({ discipline }: TodayPlanLinkProps) {
  const { t } = useTranslation("training");
  const to = discipline
    ? { pathname: "/coach/plan", search: `?sport=${discipline}` }
    : "/coach/plan";

  return (
    <LocalizedLink
      to={to}
      className={buttonClass({ variant: "ghost", size: "sm" })}
    >
      {t("today.viewTodayPlan")}
      <ChevronRight size={ICON_SIZE.md} aria-hidden="true" />
    </LocalizedLink>
  );
}
