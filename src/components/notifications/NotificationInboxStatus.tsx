import { useTranslation } from "react-i18next";
import { Button, Stack, Text } from "../../theme/components";

// 목록 위: 첫 불러오기·빈 상태·실패만. 30초 백그라운드 갱신 중엔 목록을 그대로 두고 문구를 띄우지 않는다.
export function NotificationInboxStatus({ loading, failed, empty, onRetry }: {
  empty: boolean; loading: boolean; failed: boolean; onRetry: () => void;
}) {
  const { t } = useTranslation("common");
  const showEmpty = empty && !loading && !failed;
  const showLoading = empty && loading;
  if (!showEmpty && !showLoading && !failed) return null;
  return <div style={{ padding: "var(--space-4)", textAlign: showEmpty || showLoading ? "center" : undefined }}>
    <Stack gap="var(--space-2)">
      {showEmpty && <Text tone="tertiary">{t("label.noNotifications")}</Text>}
      {showLoading && <Text role="status" tone="tertiary">{t("notif.loading")}</Text>}
      {failed && <><Text role="alert">{t("notif.failed")}</Text><Button variant="outline" onClick={onRetry}>{t("notif.retry")}</Button></>}
    </Stack>
  </div>;
}

// 목록 아래: 이전 알림 더 보기
export function NotificationInboxMore({ hasMore, loading, onMore }: { hasMore: boolean; loading: boolean; onMore: () => void }) {
  const { t } = useTranslation("common");
  if (!hasMore) return null;
  return <div style={{ padding: "var(--space-2) var(--space-4)" }}>
    <Button variant="ghost" block disabled={loading} onClick={onMore}>{t("notif.more")}</Button>
  </div>;
}
