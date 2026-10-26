import { ZoneTimeBar } from "../features/activity/detail/ActivityOverviewCharts";
import { Disclosure, Select, Text, ToggleButton, ToggleControls } from "../theme";
import { PowerReadingControls } from "../features/activity/detail/PowerReadingControls";
import "../features/activity/detail/activity-personal-benchmark.css";
import "../i18n";
import "../pages/activity/activity-detail-page.css";

/** Synthetic records only: the same rows and disclosure layout used by activity analysis. */
export default function ActivityReadingLayoutPreview() {
  return <><PowerReadingControls>
    <div className="activity-power-basis"><Text variant="bodySmall" tone="secondary">파워 비교 기준</Text><ToggleControls variant="axis" layout="field" aria-label="파워 비교 기준"><ToggleButton selected>이번 활동</ToggleButton><ToggleButton selected={false}>최근 90일</ToggleButton></ToggleControls></div>
    <label className="activity-benchmark-duration"><Text variant="bodySmall" tone="secondary">지속시간</Text><Select defaultValue="300"><option value="300">5분</option></Select></label>
  </PowerReadingControls><div className="activity-analysis-zones">
    {(["power", "heartRate"] as const).map(kind => {
      const percentages = kind === "power" ? [40, 20, 15, 10, 7, 5, 3] : [30, 35, 20, 10, 5];
      return <section key={kind} className="activity-analysis-zone">
        <Text as="h3" variant="subtitle">{kind === "power" ? "파워" : "심박"}</Text>
        <ZoneTimeBar layout="rows" heading="이번 활동 · 생성 예시" zone={{ kind, seconds: percentages.map(pct => pct * 60), currentPercentages: percentages, priority: "primary" }} />
        <Disclosure title="시간·일량과 비교 근거"><Text as="p" variant="bodySmall">실제 활동이 아닌 100분 길이의 생성 예시입니다.</Text></Disclosure>
      </section>;
    })}
  </div></>;
}
