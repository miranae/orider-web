import { LocalizedLink as Link } from "../LocalizedLink";
import { useTranslation } from "react-i18next";
import { Text } from "../../theme";

/** A bounded preview is incomplete, rather than proof that no next event exists. */
export default function NextEventContinuation({ groupId }: { groupId: string }) {
  const { t } = useTranslation("group");
  return <Text as="div" variant="bodySmall">
    {t("events.discoveryIncomplete")} {" "}
    <Link to={`/club/${groupId}/events`}>{t("events.continueDiscovery")}</Link>
  </Text>;
}
