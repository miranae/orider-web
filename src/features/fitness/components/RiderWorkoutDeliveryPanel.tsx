import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Text } from "../../../theme/components";
import type { RiderWorkoutType } from "../../../services/riderWorkoutDeliveryContract";
import { useRiderWorkoutDelivery } from "../useRiderWorkoutDelivery";
import { getRuntimeConfig } from "../../../services/runtimeConfig";

interface RiderWorkoutDeliveryPanelProps {
  uid: string | null;
  workoutType: RiderWorkoutType;
  targetTss: 20 | 45;
  onBusyChange?: (busy: boolean) => void;
}

function duration(minutes: number, language: string): string {
  return language.startsWith("ko") ? `${minutes}분` : `${minutes} min`;
}

function EnabledRiderWorkoutDeliveryPanel({ uid, workoutType, targetTss, onBusyChange }: RiderWorkoutDeliveryPanelProps) {
  const { t, i18n } = useTranslation("fitness");
  const controller = useRiderWorkoutDelivery(uid, workoutType);
  const selectedDevice = controller.devices.find((device) => device.deviceId === controller.targetDeviceId);
  const state = controller.deliveryState;
  const busy = controller.submitState === "submitting";
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  if (!uid) return <Text as="p" variant="caption" tone="warning">{t("coach.delivery.login")}</Text>;
  if (controller.devicesLoading) return <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.devicesLoading")}</Text>;
  if (controller.devicesError) return <Text as="p" variant="caption" tone="warning">{t("coach.delivery.devicesError")}</Text>;
  if (controller.devices.length === 0) return <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.noDevices")}</Text>;

  return (
    <div className="fitness-coach__handoff">
      <div className="fitness-coach__delivery-preview">
        <Text as="div" variant="label">{t(`coach.choice.${workoutType}.bike`)}</Text>
        <Text as="div" variant="caption" tone="secondary">{t("coach.delivery.preflight", { tss: targetTss })}</Text>
      </div>
      <label className="fitness-coach__device-select">
        <Text as="span" variant="eyebrow">{t("coach.delivery.target")}</Text>
        <select
          value={controller.targetDeviceId}
          disabled={busy}
          onChange={(event) => controller.setTargetDeviceId(event.target.value)}
        >
          {controller.devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.deviceName || t("coach.delivery.deviceFallback")} · {device.appVersion || device.platform || device.deviceId}
            </option>
          ))}
        </select>
      </label>
      {controller.restoreLoading && <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.restoring")}</Text>}
      {controller.canCreate && !controller.submitError && (
        <Button variant="primary" block disabled={busy || !selectedDevice || controller.restoreLoading} onClick={() => void controller.submit()}>
          {busy ? t("coach.delivery.requesting") : state ? t("coach.delivery.requestNew") : t("coach.delivery.request")}
        </Button>
      )}
      {state && (
        <div className="fitness-coach__delivery-status" role="status" aria-live="polite">
          <Chip variant={state === "failed" || state === "superseded" || state === "expired" ? "warning" : state === "completed" ? "success" : "accent"} dot>
            {t(`coach.delivery.state.${state}`)}
          </Chip>
          <Text as="p" variant="caption" tone="secondary">
            {t(`coach.delivery.stateHelp.${state}`, { device: selectedDevice?.deviceName || t("coach.delivery.deviceFallback") })}
          </Text>
        </div>
      )}
      {controller.delivery?.bundle && (
        <div className="fitness-coach__bundle">
          <div className="fitness-coach__bundle-heading">
            <Text as="div" variant="label">{t("coach.delivery.bundleTitle")}</Text>
            <Text as="div" variant="caption" tone="tertiary">
              {t("coach.delivery.bundleMeta", { ftp: controller.delivery.bundle.ftpW, tss: controller.delivery.bundle.targetTss })}
            </Text>
          </div>
          <ol>
            {controller.delivery.bundle.steps.map((step, index) => (
              <li key={`${step.label}-${index}`}>
                <Text as="span" variant="label">{t(`coach.delivery.step.${step.label}`)}</Text>
                <Text as="span" variant="caption" tone="secondary">
                  {duration(Math.round(step.durationSec / 60), i18n.language)} · {step.targetPowerMinW}–{step.targetPowerMaxW} W
                </Text>
              </li>
            ))}
          </ol>
          <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.serverAuthority")}</Text>
        </div>
      )}
      {controller.submitError && (
        <div className="fitness-coach__delivery-error" role="alert">
          <Text as="p" variant="caption" tone="warning">{t(`coach.delivery.error.${controller.submitErrorKind ?? "unknown"}`)}</Text>
          {controller.canSafelyReplay && (
            <Button variant="outline" block disabled={busy} onClick={() => void controller.submit()}>
              {t("coach.delivery.retry")}
            </Button>
          )}
          {!controller.canSafelyReplay && controller.submitErrorKind && (
            <Button variant="outline" block disabled={busy} onClick={controller.prepareNewRequest}>
              {t(controller.submitErrorKind === "cooldown" ? "coach.delivery.prepareAfterCooldown" : "coach.delivery.prepareNew")}
            </Button>
          )}
        </div>
      )}
      <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.serverRevalidation")}</Text>
    </div>
  );
}

export default function RiderWorkoutDeliveryPanel(props: RiderWorkoutDeliveryPanelProps) {
  const { t } = useTranslation("fitness");
  if (getRuntimeConfig().riderWorkoutDeliveryEnabled !== true) {
    return <Text as="p" variant="caption" tone="tertiary">{t("coach.delivery.featurePreparing")}</Text>;
  }
  return <EnabledRiderWorkoutDeliveryPanel {...props} />;
}
