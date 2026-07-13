import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LocalizedLink } from "../LocalizedLink";
import { NAV_GROUPS } from "../settings/settingsNavigation";
import { Text } from "../../theme/components";

/** Mobile settings root: a short category hub; settings themselves live on dedicated subpages. */
export default function MobileSettingsPage() {
  const { t } = useTranslation("settings");

  return (
    <div className="mobile-settings-hub">
      <header className="mobile-settings-header">
        <LocalizedLink
          to="/my"
          className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon-only"
          aria-label={t("nav.backToProfile")}
        >
          <ChevronLeft aria-hidden="true" />
        </LocalizedLink>
        <Text as="h1" variant="subtitle" weight={700}>{t("title")}</Text>
      </header>

      <main className="mobile-settings-groups" aria-label={t("nav.mobileHubLabel")}>
        {NAV_GROUPS.map((group) => (
          <section key={group.titleKey} className="mobile-settings-group">
            <Text as="h2" variant="eyebrow">{t(group.titleKey)}</Text>
            <div className="mobile-settings-list">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <LocalizedLink
                    key={item.id}
                    to={`/settings?section=${item.id}`}
                    className="mobile-settings-item"
                  >
                    <span className="mobile-settings-item-icon" aria-hidden="true"><Icon /></span>
                    <span className="mobile-settings-item-copy">
                      <Text as="span" variant="body" weight={600}>{t(item.labelKey)}</Text>
                      <Text as="span" variant="caption" tone="tertiary">{t(item.hintKey)}</Text>
                    </span>
                    <ChevronRight className="mobile-settings-item-chevron" aria-hidden="true" />
                  </LocalizedLink>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
