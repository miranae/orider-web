import { useTranslation } from "react-i18next";
import { Button, Text } from "../../theme/components";
import "./HomeBrandIntro.css";

/**
 * 비로그인 방문자에게 보이는 홈 첫 소개. 슬로건 "Ride Your Time." 은 언어와 무관한 브랜드 표기이고,
 * 한국어 병기(sloganTagline)는 값이 있는 언어에서만 보인다. 표기 규칙은 O·RIDER 브랜드 가이드를 따른다.
 */
export function HomeBrandIntro({ layout, onStart, starting }: {
  layout: "card" | "banner";
  onStart: () => void;
  starting: boolean;
}) {
  const { t, i18n } = useTranslation("dashboard");
  // 빈 값은 한국어로 폴백되므로 언어로 판정한다. 병기는 한국어 화면에만 둔다.
  const tagline = i18n.resolvedLanguage === "ko" ? t("header.sloganTagline") : "";
  return <div className={`home-brand-intro home-brand-intro--${layout}`} data-testid="home-brand-intro">
    <div className="home-brand-intro-copy">
      <Text as="h2" className="home-brand-intro-slogan">{t("header.slogan")}</Text>
      {tagline && <Text as="p" variant="bodyMedium" weight={600} className="home-brand-intro-tagline">{tagline}</Text>}
      <Text as="p" variant="bodySmall" tone="secondary">{t("header.anonSubtitle")}</Text>
    </div>
    <Button variant="primary" size="sm" onClick={onStart} loading={starting}>{t("header.anonCta")}</Button>
  </div>;
}
