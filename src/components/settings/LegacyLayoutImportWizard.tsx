import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DataPageConfig } from "@shared/types/deviceSettings";

import { useBikeProfileLayout } from "../../hooks/useBikeProfileLayout";
import { useBikeProfiles } from "../../hooks/useBikeProfiles";
import { useToast } from "../../contexts/ToastContext";
import { Button, DropdownSelect, Text } from "../../theme/components";

type DeviceOption = { deviceId: string; label: string; config: DataPageConfig };

/**
 * 기기에 남은 옛 구성을 자전거로 가져오기 (#1943 §5.2, #1950).
 *
 * 이관 뒤 legacy 화면은 읽기 전용이지만, 거기 있는 구성을 **버리게** 두지는 않는다. 다만
 * 가져오기는 대상 자전거의 구성을 **통째로 교체**하므로, 무엇이 무엇을 덮는지 보여 준 뒤에만
 * 실행한다 — 미리보기 없이 교체하면 사용자는 잃은 것을 되돌릴 방법이 없다.
 */
export function LegacyLayoutImportWizard({
  uid,
  devices,
  initialDeviceId,
  onDone,
}: {
  uid: string | null;
  devices: DeviceOption[];
  initialDeviceId: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation("settings");
  const { showToast } = useToast();
  const { profiles } = useBikeProfiles(uid);
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? devices[0]?.deviceId ?? "");
  const [targetProfileId, setTargetProfileId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const source = devices.find((d) => d.deviceId === deviceId) ?? null;
  const target = profiles.find((p) => p.id === targetProfileId) ?? null;

  // 대상 자전거의 **현재** 구성을 함께 보여 준다 — 교체될 쪽을 모르면 확인은 형식일 뿐이다.
  const { config: targetConfig, canSave, save } = useBikeProfileLayout(
    uid,
    targetProfileId,
    source?.config.pages ?? [],
  );

  const summary = useMemo(() => {
    const count = (config: DataPageConfig | null) => ({
      pages: config?.pages.length ?? 0,
      fields: config?.pages.reduce((sum, p) => sum + p.fields.length, 0) ?? 0,
    });
    return { from: count(source?.config ?? null), to: count(targetConfig) };
  }, [source, targetConfig]);

  async function handleImport() {
    if (!source || !target) return;
    setBusy(true);
    try {
      const result = await save(source.config.pages);
      if (result.status === "synced" || result.status === "savedPendingSync") {
        showToast(t("device.legacyImportDone", { name: target.name }));
        onDone();
      } else {
        // 실패를 성공으로 뭉개면 사용자는 옮겼다고 믿고 기기 구성을 지운다.
        showToast(t("device.legacyImportFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (profiles.length === 0) {
    return (
      <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }} data-testid="legacy-import-no-bikes">
        {t("device.legacyImportNoBikes")}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }} data-testid="legacy-import-wizard">
      <label style={{ display: "grid", gap: "var(--space-1)" }}>
        <Text variant="eyebrow">{t("device.legacyImportSourceDevice")}</Text>
        <div data-testid="legacy-import-device"><DropdownSelect label={t("device.legacyImportSourceDevice")}
          value={deviceId} onChange={(value) => { setDeviceId(value); setConfirming(false); }}
          disabled={busy} options={devices.map((d) => ({ value: d.deviceId, label: d.label }))} /></div>
      </label>

      <label style={{ display: "grid", gap: "var(--space-1)" }}>
        <Text variant="eyebrow">{t("device.legacyImportTargetBike")}</Text>
        <div data-testid="legacy-import-target"><DropdownSelect label={t("device.legacyImportTargetBike")}
          value={targetProfileId ?? ""} onChange={(value) => { setTargetProfileId(value || null); setConfirming(false); }} disabled={busy}
          options={[{ value: "", label: t("device.legacyImportTargetPlaceholder") }, ...profiles.map((p) => ({ value: p.id, label: p.name }))]} /></div>
      </label>

      {target && (
        <div
          style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}
          data-testid="legacy-import-preview"
        >
          {t("device.legacyImportPreview", {
            fromPages: summary.from.pages,
            fromFields: summary.from.fields,
            toPages: summary.to.pages,
            toFields: summary.to.fields,
            name: target.name,
          })}
        </div>
      )}

      {/* 교체는 되돌릴 수 없다 — 한 번 더 묻는다. */}
      {target && !confirming && (
        <Button
          variant="secondary"
          size="md"
          disabled={busy || !canSave || !source}
          onClick={() => setConfirming(true)}
          data-testid="legacy-import-start"
        >
          {t("device.legacyImportStart")}
        </Button>
      )}
      {target && confirming && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
          <Text variant="body" style={{ color: "var(--ink-2)" }}>
            {t("device.legacyImportConfirm", { name: target.name })}
          </Text>
          <Button
            variant="primary"
            size="md"
            onClick={handleImport}
            disabled={busy || !canSave}
            data-testid="legacy-import-confirm"
          >
            {t("device.legacyImportConfirmAction")}
          </Button>
          <Button variant="ghost" size="md" onClick={() => setConfirming(false)} disabled={busy}>
            {t("device.legacyImportCancel")}
          </Button>
        </div>
      )}
      {/* 대상 레코드를 읽지 못한 상태에서는 가져오지 않는다 — 원문을 덮어쓴다. */}
      {target && !canSave && (
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }} data-testid="legacy-import-blocked">
          {t("device.legacyImportBlocked")}
        </div>
      )}
    </div>
  );
}
