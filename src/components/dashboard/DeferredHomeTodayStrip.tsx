import { useMemo, useState, Suspense, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { ErrorBoundary } from "../ErrorBoundary";
import { Button, Card, Text } from "../../theme/components";
import { lazyWithRetry } from "../../utils/lazyWithRetry";
import type HomeTodayStrip from "./HomeTodayStrip";

/** Desktop-only module loading must not suspend or replace the activity feed. */
export default function DeferredHomeTodayStrip(props: ComponentProps<typeof HomeTodayStrip>) {
  const { t } = useTranslation("dashboard");
  const [attempt, setAttempt] = useState(0);
  const Strip = useMemo(() => lazyWithRetry(() => import("./HomeTodayStrip")), [attempt]);
  return <ErrorBoundary key={attempt} fallback={() => <Card>
    <Text role="alert">{t("todayStrip.unavailable")}</Text>
    <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>{t("feed.error.retry")}</Button>
  </Card>}>
    <Suspense fallback={<Card role="status"><Text tone="secondary">{t("todayStrip.loading")}</Text></Card>}>
      <Strip {...props} />
    </Suspense>
  </ErrorBoundary>;
}
