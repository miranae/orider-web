import { useTranslation } from "react-i18next";
import { EmptyState } from "../components/redesign";

export default function NotFoundPage() {
  const { t } = useTranslation("common");

  return (
    <section
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "var(--space-8) var(--space-4)",
      }}
    >
      <EmptyState
        icon="404"
        title={t("error.notFound")}
        description={t("notFound.description")}
        actions={[{ label: t("nav.home"), variant: "primary", href: "/" }]}
      />
    </section>
  );
}
