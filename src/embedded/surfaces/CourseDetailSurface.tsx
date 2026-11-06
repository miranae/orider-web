import { lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";

const CoursePage = lazy(() => import("../../pages/CoursePage"));

/** 모르는 하위 경로는 상세 첫 화면으로 돌린다. 언어·코스는 바깥 라우트 값이다. */
function CourseDetailRedirect() {
  const { lang, courseId } = useParams();
  return <Navigate replace to={`/${lang ?? "ko"}/embed/courses/${encodeURIComponent(courseId ?? "")}`} />;
}

/**
 * 앱 코스 상세: 웹 코스 상세(`/course/:courseId`)를 그대로 그린다. 코스는 공개 데이터라 게스트로도
 * 열린다. 상세 밖 링크(세그먼트·작성자·코스 만들기 등)는 기존처럼 `navigation.openNative` 로 앱에
 * 넘긴다(hubNavigation).
 */
export default function CourseDetailSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  return (
    <HubSurfaceFrame {...props} title={t("nav.courses")} testId="embedded-course-detail">
      <Routes>
        <Route index element={<CoursePage />} />
        <Route path="*" element={<CourseDetailRedirect />} />
      </Routes>
    </HubSurfaceFrame>
  );
}
