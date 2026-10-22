import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LocalizedLink } from "../LocalizedLink";
import { NAV_GROUPS, settingsTabPath } from "../settings/settingsNavigation";
import { Text } from "../../theme/components";
import { ICON_SIZE } from "../../theme/tokens/icon";

/** Mobile settings root: a short category hub; settings themselves live on dedicated subpages. */
export default function MobileSettingsPage() {
  const { t } = useTranslation("settings");

  return (
    <div className="mobile-settings-hub">
      <header className="mobile-settings-header">
        <LocalizedLink
          to="/athlete/me"
          className="mobile-settings-back"
          aria-label={t("nav.backToProfile")}
        >
          <ChevronLeft size={ICON_SIZE.lg} aria-hidden="true" />
        </LocalizedLink>
        <Text as="h1" variant="subtitle" className="mobile-settings-title">{t("title")}</Text>
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
                    to={settingsTabPath(item.id)}
                    className="mobile-settings-item"
                  >
                    {/* 색 타일 29 + 흰 글리프 18 (S4) — 행마다 다른 색 */}
                    <span className="mobile-settings-item-icon" data-tint={item.id} aria-hidden="true"><Icon /></span>
                    <span className="mobile-settings-item-copy">
                      <Text as="span" variant="body">{t(item.labelKey)}</Text>
                      <Text as="span" variant="bodySmall" tone="tertiary">{t(item.hintKey)}</Text>
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
