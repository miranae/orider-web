import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";

import { useToast } from "../../contexts/ToastContext";
import { useLocale } from "../../contexts/LocaleContext";
import { useStrava } from "../../hooks/useStrava";
import { useExport } from "../../hooks/useExport";
import { SUPPORTED_LANGS, type Lang } from "../../i18n/detector";

import { SettingsCard, Field, FieldGrid, InlineRow } from "./_primitives";
import { Button, Text } from "../../theme/components";
import { useOriderTheme } from "../../theme";

const LANG_LABELS: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
};

export function PaneApp() {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const { showToast } = useToast();
  const { locale, units, setLocale, setUnits } = useLocale();
  const { exportData, loading: exportLoading, progress: exportProgress } = useExport();
  const { deleteUserData, loading: stravaLoading } = useStrava();
  const { theme: designTheme, setThemeId, availableThemes } = useOriderTheme();

  const [exportFormat, setExportFormat] = useState<"GPX" | "TCX" | "FIT" | "JSON">("GPX");

  async function handleClearCache() {
    if (!window.confirm(t("data.clearCacheConfirm"))) return;
    try {
      await deleteUserData(true);
      showToast(t("data.cacheCleared"));
    } catch (e) {
      showToast(`${t("pane.app.clearCacheFailed")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm(t("data.deleteConfirm"))) return;
    try {
      await deleteUserData();
      showToast(t("data.deleted"));
    } catch (e) {
      showToast(`${t("pane.app.deleteFailed")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <>
      <SettingsCard title={t("pane.app.cardLocaleUnits")} dense>
        <FieldGrid cols={2}>
          <Field label={t("pane.app.fieldLang")} hint={t("pane.app.fieldLangHint")}>
            <div
              style={{
                display: "flex",
                gap: 'var(--space-1)',
                padding: 2,
                background: "var(--bg-2)",
                borderRadius: 8,
              }}
            >
              {SUPPORTED_LANGS.map((lang) => (
                <button
                  key={lang}
                  onClick={() => void setLocale(lang)}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    cursor: "pointer",
                    border: "none",
                    background: locale === lang ? "var(--bg-1)" : "transparent",
                    color: locale === lang ? "var(--ink-0)" : "var(--ink-3)",
                    boxShadow:
                      locale === lang ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("pane.app.fieldUnits")} hint={t("pane.app.fieldUnitsHint")}>
            <div
              style={{
                display: "flex",
                gap: 'var(--space-1)',
                padding: 2,
                background: "var(--bg-2)",
                borderRadius: 8,
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
                  onClick={() => void setUnits(id)}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    cursor: "pointer",
                    border: "none",
                    background: units === id ? "var(--bg-1)" : "transparent",
                    color: units === id ? "var(--ink-0)" : "var(--ink-3)",
                    boxShadow: units === id ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </FieldGrid>
      </SettingsCard>

      <SettingsCard title={t("pane.app.cardDesignTheme")} dense>
        <Field label={t("pane.app.fieldTheme")} hint={t("pane.app.fieldThemeHint")}>
          <div
            style={{
              display: "flex",
              gap: 'var(--space-1)',
              padding: 2,
              background: "var(--bg-2)",
              borderRadius: 8,
            }}
          >
            {availableThemes.map((thm) => {
              const active = designTheme.id === thm.id;
              return (
                <button
                  key={thm.id}
                  onClick={() => setThemeId(thm.id)}
                  aria-pressed={active}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--bg-1)" : "transparent",
                    color: active ? "var(--ink-0)" : "var(--ink-3)",
                    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {thm.labelKey ? tCommon(thm.labelKey) : thm.label}
                </button>
              );
            })}
          </div>
        </Field>
      </SettingsCard>

      <SettingsCard title={t("pane.app.cardExport")}>
        <div style={{ marginBottom: 14 }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>
            {t("pane.app.exportFormatLabel")}
          </Text>
          <div style={{ display: "flex", gap: 6 }}>
            {(["GPX", "TCX", "FIT", "JSON"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setExportFormat(f)}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  background: exportFormat === f ? "var(--bg-3)" : "var(--bg-2)",
                  color: exportFormat === f ? "var(--ink-0)" : "var(--ink-3)",
                  border: `1px solid ${
                    exportFormat === f ? "var(--ink-3)" : "var(--line-soft)"
                  }`,
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <InlineRow label={t("pane.app.exportAllLabel")} hint={t("pane.app.exportAllHint")}>
          <Button variant="secondary" onClick={exportData} disabled={exportLoading}>
            <Download size={12} />
            {exportLoading ? t("data.preparing") : t("data.downloadAll")}
          </Button>
        </InlineRow>
        {exportProgress && (
          <div style={{ padding: "12px 0" }}>
            <div style={{ padding: 'var(--space-3)', background: "var(--bg-2)", borderRadius: 8 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "var(--ink-2)",
                  marginBottom: 6,
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
                  borderRadius: 999,
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
        <InlineRow label={t("pane.app.clearCacheLabel")} hint={t("pane.app.clearCacheHint")}>
          <Button variant="secondary"
            onClick={handleClearCache}
            disabled={stravaLoading}
          >
            {t("pane.app.clearCacheBtn")}
          </Button>
        </InlineRow>
      </SettingsCard>

      <SettingsCard title={t("pane.app.cardDeleteAll")} danger dense>
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-3)",
            marginBottom: 'var(--space-3)',
            lineHeight: 1.5,
          }}
        >
          {t("pane.app.deleteAllWarning")}
        </div>
        <Button variant="danger"
          onClick={handleDeleteAll}
          disabled={stravaLoading}
        >
          {stravaLoading ? t("data.deleting") : t("pane.app.deleteAllBtn")}
        </Button>
      </SettingsCard>
    </>
  );
}
