import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { Card, Text } from "../../theme/components";
import { calculateVirtualPowerTool } from "../../utils/virtualPowerTool";

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function VirtualPowerToolPage() {
  const { i18n } = useTranslation();
  const ko = i18n.language.startsWith("ko");
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
    eyebrow: ko ? "공개 계산기" : "Public calculator",
    title: ko ? "가상 파워 · FTP 추정기" : "Virtual power and FTP estimator",
    desc: ko
      ? "속도, 경사, 체중만으로 검증된 Orider 가상 파워 계산을 체험합니다. 로그인 없이 예상 와트, TSS, 20분 FTP 추정치를 확인할 수 있습니다."
      : "Try Orider's validated virtual power estimate from speed, grade, and weight. No sign-in is required for watts, TSS, and a 20-minute FTP estimate.",
    speed: ko ? "평균 속도" : "Average speed",
    grade: ko ? "평균 경사" : "Average grade",
    duration: ko ? "운동 시간" : "Duration",
    rider: ko ? "라이더 체중" : "Rider weight",
    bike: ko ? "자전거 무게" : "Bike weight",
    ftp: ko ? "현재 FTP" : "Current FTP",
    watts: ko ? "예상 평균 파워" : "Estimated average power",
    tss: ko ? "예상 TSS" : "Estimated TSS",
    ftpEstimate: ko ? "20분 FTP 추정" : "20-min FTP estimate",
    distance: ko ? "예상 거리" : "Estimated distance",
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
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
        <span style={{ width: 44, height: 44, borderRadius: "var(--r-md)", background: "color-mix(in oklch, var(--lime) 16%, var(--bg-2))", display: "grid", placeItems: "center", color: "var(--lime)" }}>
          <Zap size={22} />
        </span>
        <div>
          <Text as="div" variant="eyebrow" style={{ color: "var(--lime)" }}>{labels.eyebrow}</Text>
          <Text as="h1" variant="pageTitle" style={{ margin: 0 }}>{labels.title}</Text>
        </div>
      </div>
      <p style={{ maxWidth: 720, color: "var(--ink-3)", fontSize: "var(--fs-sm)", lineHeight: 1.7, marginBottom: "var(--space-6)" }}>{labels.desc}</p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)", gap: "var(--space-5)" }}>
        <Card padding="none" style={{ padding: "var(--space-5)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(160px, 1fr))", gap: "var(--space-4)" }}>
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
