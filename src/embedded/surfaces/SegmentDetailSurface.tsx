import { lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";

const SegmentPage = lazy(() => import("../../pages/SegmentPage"));

/** 모르는 하위 경로는 상세 첫 화면으로 돌린다. 언어·세그먼트는 바깥 라우트 값이다. */
function SegmentDetailRedirect() {
  const { lang, segmentId } = useParams();
  return <Navigate replace to={`/${lang ?? "ko"}/embed/segments/${encodeURIComponent(segmentId ?? "")}`} />;
}

/**
 * 앱 세그먼트 상세: 웹 세그먼트 상세(`/segment/:segmentId`)를 그대로 그린다. 세그먼트는 공개 데이터라
 * 게스트로도 열린다. 상세 밖 링크(코스·활동·작성자 등)는 코스 상세 임베드처럼 `navigation.openNative` 로
 * 앱에 넘긴다(hubNavigation). 뒤로가기·닫기는 앱 화면이 맡는다.
 */
export default function SegmentDetailSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  return (
    <HubSurfaceFrame {...props} title={t("nav.segments")} testId="embedded-segment-detail">
      <Routes>
        <Route index element={<SegmentPage />} />
        <Route path="*" element={<SegmentDetailRedirect />} />
      </Routes>
    </HubSurfaceFrame>
  );
}
