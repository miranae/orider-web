import { useTranslation } from "react-i18next";
import { Card, Text } from "../theme/components";
import CoachSignInButton from "../pages/coach/CoachSignInButton";

/** Sign-in keeps the current route, including its filters and return context. */
export default function SignInRequired({ description }: { description: string }) {
  const { t } = useTranslation("common");
  return <Card style={{ margin: "var(--space-6) var(--space-4)", padding: "var(--space-6)", textAlign: "center" }}>
    <Text as="p" variant="body" style={{ marginBottom: "var(--space-4)" }}>{description}</Text>
    <CoachSignInButton label={t("button.login")} />
  </Card>;
}
