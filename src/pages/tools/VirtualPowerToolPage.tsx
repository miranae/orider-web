import { standaloneText } from "../../i18n/standaloneText";
import "./VirtualPowerToolPage.css";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { Card, Text } from "../../theme/components";
import { calculateVirtualPowerTool } from "../../utils/virtualPowerTool";
import { ICON_SIZE } from "../../theme/tokens/icon";

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function VirtualPowerToolPage() {
  const { i18n } = useTranslation();
  const [speedKmh, setSpeedKmh] = useState("28");
  const [gradePercent, setGradePercent] = useState("3");
  const [durationMin, setDurationMin] = useState("40");
  const [riderWeightKg, setRiderWeightKg] = useState("68");
  const [bikeWeightKg, setBikeWeightKg] = useState("9");
  const [ftp, setFtp] = useState("220");

  const result = useMemo(
    () => calculateVirtualPowerTool({
      speedKmh: numberValue(speedKmh, 28),
      gradePercent: numberValue(gradePercent, 3),
      durationMin: numberValue(durationMin, 40),
      riderWeightKg: numberValue(riderWeightKg, 68),
      bikeWeightKg: numberValue(bikeWeightKg, 9),
      ftp: numberValue(ftp, 220),
    }),
    [bikeWeightKg, durationMin, ftp, gradePercent, riderWeightKg, speedKmh],
  );

  const labels = {
    eyebrow: standaloneText(i18n.language, "virtual_power_eyebrow"),
    title: standaloneText(i18n.language, "virtual_power_title"),
    desc: standaloneText(i18n.language, "virtual_power_desc"),
    speed: standaloneText(i18n.language, "virtual_power_speed"),
    grade: standaloneText(i18n.language, "virtual_power_grade"),
    duration: standaloneText(i18n.language, "virtual_power_duration"),
    rider: standaloneText(i18n.language, "virtual_power_rider"),
    bike: standaloneText(i18n.language, "virtual_power_bike"),
    ftp: standaloneText(i18n.language, "virtual_power_ftp"),
    watts: standaloneText(i18n.language, "virtual_power_watts"),
    tss: standaloneText(i18n.language, "virtual_power_tss"),
    ftpEstimate: standaloneText(i18n.language, "virtual_power_ftpEstimate"),
    distance: standaloneText(i18n.language, "virtual_power_distance"),
  };

  const fields = [
    { label: labels.speed, value: speedKmh, setValue: setSpeedKmh, unit: "km/h" },
    { label: labels.grade, value: gradePercent, setValue: setGradePercent, unit: "%" },
    { label: labels.duration, value: durationMin, setValue: setDurationMin, unit: "min" },
    { label: labels.rider, value: riderWeightKg, setValue: setRiderWeightKg, unit: "kg" },
    { label: labels.bike, value: bikeWeightKg, setValue: setBikeWeightKg, unit: "kg" },
    { label: labels.ftp, value: ftp, setValue: setFtp, unit: "W" },
  ];

  return (
    <div className="site-shell" style={{ padding: "32px 20px 64px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <span style={{ width: 44, height: 44, borderRadius: "var(--r-md)", background: "color-mix(in oklch, var(--lime) 16%, var(--bg-2))", display: "grid", placeItems: "center", color: "var(--lime)" }}>
          <Zap size={ICON_SIZE.lg} />
        </span>
        <div>
          <Text as="div" variant="eyebrow" style={{ color: "var(--lime)" }}>{labels.eyebrow}</Text>
          <Text as="h1" variant="pageTitle" style={{ margin: 0 }}>{labels.title}</Text>
        </div>
      </div>
      <p style={{ maxWidth: 720, color: "var(--ink-3)", fontSize: "var(--fs-sm)", lineHeight: 1.7, marginBottom: "var(--space-4)" }}>{labels.desc}</p>

      <div className="virtual-power-layout">
        <Card padding="none" style={{ padding: "var(--space-5)" }}>
          <div className="virtual-power-fields">
            {fields.map((field) => (
              <label key={field.label} style={{ display: "grid", gap: "var(--space-1-5)" }}>
                <Text as="span" variant="eyebrow">{field.label}</Text>
                <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <input
                    type="number"
                    value={field.value}
                    onChange={(event) => field.setValue(event.target.value)}
                    style={{ width: "100%", background: "var(--bg-2)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", color: "var(--ink-0)", padding: "10px 12px", fontSize: "var(--fs-sm)" }}
                  />
                  <span style={{ minWidth: 44, color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>{field.unit}</span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card padding="none" style={{ padding: "var(--space-5)", display: "grid", gap: "var(--space-4)" }}>
          {[
            { label: labels.watts, value: result.averageWatts, unit: "W", color: "var(--lime)" },
            { label: labels.tss, value: result.estimatedTss ?? "-", unit: "", color: "var(--rose)" },
            { label: labels.ftpEstimate, value: result.ftpEstimate, unit: "W", color: "var(--amber)" },
            { label: labels.distance, value: result.distanceKm, unit: "km", color: "var(--aqua)" },
          ].map((item) => (
            <div key={item.label} style={{ borderBottom: "1px solid var(--line-soft)", paddingBottom: "var(--space-3)" }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{item.label}</Text>
              <Text variant="dataLarge" style={{ color: item.color }}>{item.value}</Text>
              {item.unit && <Text variant="unit" style={{ marginLeft: "var(--space-1)" }}>{item.unit}</Text>}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
