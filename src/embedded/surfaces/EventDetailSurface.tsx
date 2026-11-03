import { lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GlossaryProvider } from "../../components/common/GlossaryProvider";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";

const ClubMeetingPage = lazy(() => import("../../pages/group/ClubMeetingPage"));
const EventDetailPage = lazy(() => import("../../pages/event/EventDetailPage"));
const EventRegisterPage = lazy(() => import("../../pages/event/EventRegisterPage"));
const EventResultsPage = lazy(() => import("../../pages/event/EventResultsPage"));
const EventDashboardPage = lazy(() => import("../../pages/event/EventDashboardPage"));
const EventEditPage = lazy(() => import("../../pages/event/EventEditPage"));
const EventParticipantsPage = lazy(() => import("../../pages/event/EventParticipantsPage"));

function EventDetailRedirect() {
  const { lang, eventId } = useParams();
  return <Navigate replace to={`/${lang ?? "ko"}/embed/event/${encodeURIComponent(eventId ?? "")}`} />;
}

/** 웹과 같은 이벤트 화면. 등록·결과·주최자 화면도 로그인된 같은 웹뷰 안에서 연다. */
export default function EventDetailSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  return (
    <HubSurfaceFrame {...props} title={t("nav.events")} testId="embedded-event-detail">
      <GlossaryProvider>
        <Routes>
          <Route index element={<EventDetailPage />} />
          <Route path="meeting/:groupId/:meetingId" element={<ClubMeetingPage />} />
          <Route path="register" element={<EventRegisterPage />} />
          <Route path="results" element={<EventResultsPage />} />
          <Route path="host" element={<EventDashboardPage />} />
          <Route path="host/edit" element={<EventEditPage />} />
          <Route path="host/participants" element={<EventParticipantsPage />} />
          <Route path="*" element={<EventDetailRedirect />} />
        </Routes>
      </GlossaryProvider>
    </HubSurfaceFrame>
  );
}
