import { useTranslation } from "react-i18next";
import { Button, Stack, Text } from "../../theme/components";
export function NotificationInboxStatus({ loading, failed, hasMore, empty, onRetry, onMore }: {
  empty: boolean; loading: boolean; failed: boolean; hasMore: boolean; onRetry: () => void; onMore: () => void;
}) {
  const { t } = useTranslation("common");
  return <Stack gap="var(--space-2)">
    {!empty && <Text variant="caption">{t("notif.refreshScope")}</Text>}
    {empty && !loading && !failed && <Text>{t("label.noNotifications")}</Text>}
    {loading && <Text role="status">{t("notif.loading")}</Text>}
    {failed && <><Text role="alert">{t("notif.failed")}</Text><Button variant="outline" onClick={onRetry}>{t("notif.retry")}</Button></>}
    {hasMore && <Button variant="ghost" disabled={loading} onClick={onMore}>{t("notif.more")}</Button>}
  </Stack>;
}
