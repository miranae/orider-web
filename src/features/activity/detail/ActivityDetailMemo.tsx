import ActivityMemoText from "../../../components/activity/ActivityMemoText";
import type { Activity } from "@shared/types";
import { useTranslation } from "react-i18next";
import { resolveActivityMemo } from "../../../services/activityFeedContent";
import { Card, Text } from "../../../theme/components";

export default function ActivityDetailMemo({ activity }: { activity: Activity }) {
  const { i18n } = useTranslation();
  const resolved = resolveActivityMemo(activity, i18n.language.startsWith("en") ? "en" : "ko");
  if (!resolved) return null;
  return <Card data-testid="activity-detail-memo">
    <Text as="p" variant="body" fixedWidth={!resolved.authored} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><ActivityMemoText memo={resolved.memo} generated={!resolved.authored} /></Text>
  </Card>;
}
