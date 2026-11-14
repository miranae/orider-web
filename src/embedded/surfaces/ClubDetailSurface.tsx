import { lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GlossaryProvider } from "../../components/common/GlossaryProvider";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";

const ClubHomePage = lazy(() => import("../../pages/group/ClubHomePage"));
const GroupDashboardPage = lazy(() => import("../../pages/group/GroupDashboardPage"));
const GroupRidesPage = lazy(() => import("../../pages/group/GroupRidesPage"));
const GroupRidePage = lazy(() => import("../../pages/group/GroupRidePage"));
const GroupWeekPage = lazy(() => import("../../pages/group/GroupWeekPage"));
const ClubMeetingLivePage = lazy(() => import("../../pages/group/ClubMeetingLivePage"));
const ClubMeetingPage = lazy(() => import("../../pages/group/ClubMeetingPage"));
const ClubEventsRedirect = lazy(() => import("../../pages/group/ClubEventsRedirect"));
const GroupMembersPage = lazy(() => import("../../pages/group/GroupMembersPage"));
const GroupSettingsPage = lazy(() => import("../../pages/group/GroupSettingsPage"));

/** 상세 안의 다른 하위 경로로 바꾼다(옛 leaderboard·모르는 하위 경로). 언어·클럽은 바깥 라우트 값이다. */
function ClubDetailRedirect({ section = "" }: { section?: string }) {
  const { lang, groupId } = useParams();
  return <Navigate replace to={`/${lang ?? "ko"}/embed/clubs/${encodeURIComponent(groupId ?? "")}${section}`} />;
}

/**
 * 앱 클럽 상세: 웹 클럽 상세(`/club/:groupId`)와 그 하위 화면을 그대로 그린다. 하위 이동
 * (게시글·멤버·일정·주행·설정)은 `embed/clubs/:groupId/*` 안에서 처리하고, 다른 클럽·활동 등
 * 상세 밖 링크는 기존처럼 `navigation.openNative` 로 앱에 넘긴다(hubNavigation).
 * 하위 경로는 웹 라우트(App.tsx `club/:groupId/...`)와 같은 이름을 쓴다.
 */
export default function ClubDetailSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  return (
    <HubSurfaceFrame {...props} title={t("nav.clubs")} testId="embedded-club-detail">
      <GlossaryProvider>
        <Routes>
          <Route index element={<ClubHomePage />} />
          <Route path="news" element={<GroupDashboardPage />} />
          <Route path="rides" element={<GroupRidesPage />} />
          <Route path="rides/:rideId" element={<GroupRidePage />} />
          <Route path="week" element={<GroupWeekPage />} />
          <Route path="leaderboard" element={<ClubDetailRedirect section="/week" />} />
          <Route path="meetings/new" element={<ClubMeetingPage mode="new" />} />
          <Route path="meetings/:meetingId/edit" element={<ClubMeetingPage mode="edit" />} />
          <Route path="meetings/:meetingId/live" element={<ClubMeetingLivePage />} />
          <Route path="meetings/:meetingId" element={<ClubMeetingPage />} />
          <Route path="events" element={<ClubEventsRedirect />} />
          <Route path="members" element={<GroupMembersPage />} />
          <Route path="settings" element={<GroupSettingsPage />} />
          <Route path="*" element={<ClubDetailRedirect />} />
        </Routes>
      </GlossaryProvider>
    </HubSurfaceFrame>
  );
}
