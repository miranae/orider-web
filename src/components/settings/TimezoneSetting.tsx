import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "../../contexts/LocaleContext";
import { useToast } from "../../contexts/ToastContext";
import { Button, Text } from "../../theme/components";
import { fieldInputStyle } from "./_primitives";

const FALLBACK_ZONES = ["Asia/Seoul", "UTC"];

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** 지원 목록이 없는 환경에서는 기기 시간대 + Asia/Seoul + UTC 만 보여 준다. */
function zoneList(device: string | null, current: string | null): string[] {
  let zones: string[];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = [...(device ? [device] : []), ...FALLBACK_ZONES];
  const set = new Set(zones);
  if (current) set.add(current);
  return [...set].sort();
}

/** 서버 하루 경계용 시간대 설정. 자동 저장 없음 — 사용자가 고를 때만 저장한다. */
export function TimezoneSetting() {
  const { t } = useTranslation("settings");
  const { showToast } = useToast();
  const { timezone, setTimezone } = useLocale();
  const device = deviceTimeZone();
  const zones = useMemo(() => zoneList(device, timezone), [device, timezone]);

  async function save(next: string | null) {
    const ok = await setTimezone(next);
    showToast(t(ok ? "pane.app.timezoneSaved" : "pane.app.timezoneSaveFailed"));
  }

  return (
    <div data-testid="timezone-setting" style={{ display: "grid", gap: "var(--space-2)" }}>
      <Text as="p" variant="bodySmall" tone="secondary">{t("pane.app.timezoneHint")}</Text>
      <Text as="p" variant="bodySmall">
        {timezone ? t("pane.app.timezoneCurrent", { tz: timezone }) : t("pane.app.timezoneUnset")}
      </Text>
      <select
        aria-label={t("pane.app.timezoneSelectLabel")}
        style={fieldInputStyle}
        value={timezone ?? ""}
        onChange={(e) => { if (e.target.value) void save(e.target.value); }}
      >
        <option value="" disabled>{t("pane.app.timezoneSelectLabel")}</option>
        {zones.map((z) => <option key={z} value={z}>{z}</option>)}
      </select>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {device && device !== timezone && (
          <Button variant="secondary" onClick={() => void save(device)}>
            {t("pane.app.timezoneUseDevice", { tz: device })}
          </Button>
        )}
        {timezone && (
          <Button variant="ghost" onClick={() => void save(null)}>{t("pane.app.timezoneReset")}</Button>
        )}
      </div>
    </div>
  );
}
