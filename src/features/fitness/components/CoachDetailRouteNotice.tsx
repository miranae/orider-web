import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Card, Text, buttonClass } from "../../../theme/components";

/** An unsupported detail never silently changes the selected sport or pretends to open. */
export default function CoachDetailRouteNotice({ discipline }: { discipline: string }) {
  const location = useLocation();
  const { t } = useTranslation("fitness");
  const params = new URLSearchParams(location.search);
  const detail = params.get("detail");
  if (!detail || detail === "closed") return null;
  const allowed = ["analysis-periods", "analysis-activity-flow", "analysis-evidence",
    ...(discipline === "bike" ? ["analysis-model", "ftp-decision"] : discipline === "run" ? ["analysis-run-records"] : [])];
  if (allowed.includes(detail)) return null;
  const next = new URLSearchParams(params); next.delete("detail");
  return <Card className="site-shell"><Text as="p" variant="bodySmall" role="status">{t("analysis.detailUnavailable")}</Text><LocalizedLink replace className={buttonClass({ variant: "secondary", size: "sm" })} to={{ pathname: location.pathname, search: next.toString(), hash: "" }}>{t("analysis.backToCurrent")}</LocalizedLink></Card>;
}
