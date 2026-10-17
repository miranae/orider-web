import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { LocalizedLink } from "../LocalizedLink";
import { useAuth } from "../../contexts/AuthContext";
import { Download } from "lucide-react";

import { useToast } from "../../contexts/ToastContext";
import { useDialog } from "../../contexts/DialogContext";
import { useLocale } from "../../contexts/LocaleContext";
import { useStrava } from "../../hooks/useStrava";
import { useExport } from "../../hooks/useExport";
import { SUPPORTED_LANGS, type Lang } from "../../i18n/detector";

import { SettingsCard, Field, FieldGrid, InlineRow } from "./_primitives";
import { Button, Text, buttonClass } from "../../theme/components";
import { useTheme, type ThemePreference } from "../../contexts/ThemeContext";
import { useOriderTheme } from "../../theme";

const LANG_LABELS: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
};

/** display: 언어·단위·테마 / data: 내보내기·캐시·전체 삭제 (/settings/display · /settings/data). */
export function PaneApp({ part }: { part: "display" | "data" }) {
  const { profile } = useAuth();
  const { hash, key } = useLocation();
  const migration = useRef<HTMLDivElement>(null);
  useEffect(() => { if (part === "data" && hash === "#migrate") migration.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, [part, hash, key]);
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const { showToast } = useToast();
  const dialog = useDialog();
  const { locale, units, setLocale, setUnits } = useLocale();
  const { exportData, loading: exportLoading, error: exportError, progress: exportProgress } = useExport();
  const { deleteUserData, loading: stravaLoading } = useStrava();
  const { theme: designTheme, setThemeId, availableThemes } = useOriderTheme();

  const { theme, setTheme } = useTheme();

  async function handleDeleteStreams() {
    if (!(await dialog.confirm(t("pane.app.streamsDeleteConfirm"), { destructive: true }))) return;
    try {
      await deleteUserData(true);
      showToast(t("pane.app.streamsDeleted"));
    } catch (e) {
      showToast(`${t("pane.app.clearCacheFailed")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDeleteStravaData() {
    if (!(await dialog.confirm(t("pane.app.stravaDeleteConfirm"), { destructive: true }))) return;
    try {
      await deleteUserData(false);
      showToast(t("pane.app.stravaDeleted"));
    } catch (e) {
      showToast(`${t("pane.app.deleteFailed")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (part === "display") return (
    <>
      <SettingsCard data-testid="S4-1-1" title={t("pane.app.cardLocaleUnits")} dense>
        <FieldGrid cols={2}>
          <Field group label={t("pane.app.fieldLang")} hint={t("pane.app.fieldLangHint")}>
            <div
              style={{
                display: "flex",
                gap: 'var(--space-1)',
                padding: "var(--space-0-5)",
                background: "var(--bg-2)",
                borderRadius: "var(--r-lg)",
              }}
            >
              {SUPPORTED_LANGS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={locale === lang}
                  onClick={() => void setLocale(lang)}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    fontSize: "var(--fs-xs)",
                    fontWeight: 500,
                    borderRadius: "var(--r-md)",
                    cursor: "pointer",
                    border: "none",
                    background: locale === lang ? "var(--bg-1)" : "transparent",
                    color: locale === lang ? "var(--ink-0)" : "var(--ink-3)",
                    boxShadow:
                      locale === lang ? "0 1px 3px color-mix(in srgb, var(--bg-0) 6%, transparent)" : "none",
                  }}
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>
          </Field>
          <Field group label={t("pane.app.fieldUnits")} hint={t("pane.app.fieldUnitsHint")}>
            <div
              style={{
                display: "flex",
                gap: 'var(--space-1)',
                padding: "var(--space-0-5)",
                background: "var(--bg-2)",
                borderRadius: "var(--r-lg)",
              }}
            >
              {(
                [
                  ["metric", "km / kg"],
                  ["imperial", "mi / lb"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={units === id}
                  onClick={() => void setUnits(id)}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    fontSize: "var(--fs-xs)",
                    fontWeight: 500,
                    borderRadius: "var(--r-md)",
                    cursor: "pointer",
                    border: "none",
                    background: units === id ? "var(--bg-1)" : "transparent",
                    color: units === id ? "var(--ink-0)" : "var(--ink-3)",
                    boxShadow: units === id ? "0 1px 3px color-mix(in srgb, var(--bg-0) 6%, transparent)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </FieldGrid>
      </SettingsCard>

      <SettingsCard title={t("pane.account.cardAppearance")} dense>
        <InlineRow label={t("theme.label")} hint={t("pane.account.themeHint")}>
          <div className="settings-segmented settings-brightness-options">
            {(["system", "light", "dark"] as const).map(id => (
              <Button key={id} variant={theme === id ? "secondary" : "ghost"} aria-pressed={theme === id} onClick={() => setTheme(id as ThemePreference)}>
                {t(`pane.account.theme${id.charAt(0).toUpperCase()}${id.slice(1)}`)}
              </Button>
            ))}
          </div>
        </InlineRow>
      </SettingsCard>

      <SettingsCard data-testid="S4-1-1" title={t("pane.app.cardDesignTheme")} dense>
        <Field group label={t("pane.app.fieldTheme")} hint={t("pane.app.fieldThemeHint")}>
          <div
            style={{
              display: "flex",
              gap: 'var(--space-1)',
              padding: "var(--space-0-5)",
              background: "var(--bg-2)",
              borderRadius: "var(--r-lg)",
            }}
          >
            {availableThemes.map((thm) => {
              const active = designTheme.id === thm.id;
              return (
                <button
                  key={thm.id}
                  type="button"
                  onClick={() => setThemeId(thm.id)}
                  aria-pressed={active}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    fontSize: "var(--fs-xs)",
                    fontWeight: 500,
                    borderRadius: "var(--r-md)",
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--bg-1)" : "transparent",
                    color: active ? "var(--ink-0)" : "var(--ink-3)",
                    boxShadow: active ? "0 1px 3px color-mix(in srgb, var(--bg-0) 6%, transparent)" : "none",
                  }}
                >
                  {thm.id === "app-parity" ? t("pane.app.appStyle") : thm.labelKey ? tCommon(thm.labelKey) : thm.label}
                </button>
              );
            })}
          </div>
        </Field>
      </SettingsCard>
    </>
  );

  return (
    <>
      <div id="migrate" ref={migration} data-testid="S3-3-1">
        <SettingsCard title={t("pane.connections.importPastLabel")}>
          <Text as="p" variant="bodySmall" tone="secondary">{t("pane.connections.importPastHint")}</Text>
          <LocalizedLink to={profile?.stravaConnected ? "/migrate" : "/settings/connections"} className={buttonClass({ variant: "secondary" })}>
            {profile?.stravaConnected ? t(profile.migration?.status === "DONE" ? "pane.connections.importBtnReport" : "pane.connections.importBtnImport") : t("strava.connect")}
          </LocalizedLink>
        </SettingsCard>
      </div>
      <SettingsCard data-testid="S3-1-1" title={t("pane.app.cardExport")}>
        <InlineRow label={t("pane.app.exportAllLabel")} hint={t("pane.app.exportAllHint")}>
          <Button variant="secondary" onClick={exportData} disabled={exportLoading}>
            <Download size={12} />
            {exportLoading ? t("data.preparing") : t("data.downloadAll")}
          </Button>
        </InlineRow>
        {exportError && <p role="alert">{t("pane.app.exportFailed")}</p>}
        {exportProgress && !exportError && (
          <div role="status" aria-live="polite" style={{ padding: "var(--space-3) 0" }}>
            <div style={{ padding: 'var(--space-3)', background: "var(--bg-2)", borderRadius: "var(--r-lg)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "var(--fs-xs)",
                  color: "var(--ink-2)",
                  marginBottom: "var(--space-1-5)",
                }}
              >
                <span>{exportProgress.label}</span>
                <span>
                  {Math.round(
                    (exportProgress.current / (exportProgress.total || 1)) * 100,
                  )}
                  %
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  borderRadius: "9999px",
                  height: 6,
                  overflow: "hidden",
                  background: "var(--bg-3)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    transition: "width 0.5s",
                    width: `${
                      (exportProgress.current / (exportProgress.total || 1)) * 100
                    }%`,
                    background: "var(--lime)",
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard data-testid="S3-2-1" title={t("pane.app.cardDeleteAll")} danger dense>
        <InlineRow label={t("pane.app.clearCacheLabel")} hint={t("pane.app.clearCacheHint")}>
          <Button variant="danger" onClick={handleDeleteStreams} disabled={stravaLoading}>
            {stravaLoading ? t("data.deleting") : t("pane.app.clearCacheBtn")}
          </Button>
        </InlineRow>
        <InlineRow label={t("pane.app.deleteAllBtn")} hint={t("pane.app.deleteAllWarning")}>
          <Button variant="danger" onClick={handleDeleteStravaData} disabled={stravaLoading}>
            {stravaLoading ? t("data.deleting") : t("pane.app.deleteAllBtn")}
          </Button>
        </InlineRow>
      </SettingsCard>
    </>
  );
}
