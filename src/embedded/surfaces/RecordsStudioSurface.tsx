import { lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { recordsStudioEmbedActivityId, recordsStudioEmbedSection } from "../hubNavigation";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";

const CreatorHubPage = lazy(() => import("../../pages/CreatorHubPage"));

/**
 * 앱 「이 기록으로 만들기」(#3956): 웹 `/records/studio` 와 같은 라이더 화면을 그린다. 개발자 안내
 * (API key·Swagger·GitHub·n8n)는 라이더 모드에서 숨긴다. 섹션은 `?section=overview|recipes|share`
 * (없거나 모르는 값은 overview), `?activity=<활동 ID>` 는 사진·경로 포스터 선택에서 그 활동을 먼저 고른다
 * — AI 일기는 최근 7일 집계로만 만들어 특정 활동을 받지 않으므로 거기에는 쓰지 않는다.
 * 비로그인(게스트)은 다른 허브 표면처럼 데모 데이터로 보인다.
 */
export default function RecordsStudioSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  const [params] = useSearchParams();
  const section = recordsStudioEmbedSection(params.get("section"));
  const activityId = recordsStudioEmbedActivityId(params.get("activity"));
  return (
    <HubSurfaceFrame {...props} title={t("nav.recordsStudio")} testId="embedded-records-studio" className="orider-embedded-records-studio">
      <CreatorHubPage mode="rider" section={section} activityId={activityId} />
    </HubSurfaceFrame>
  );
}
