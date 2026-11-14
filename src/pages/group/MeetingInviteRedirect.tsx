import { Navigate, useParams } from "react-router-dom";

/** Stable compact alias; authentication and membership stay on the canonical page. */
export default function MeetingInviteRedirect() {
  const { lang, groupId, meetingId } = useParams();
  return <Navigate replace to={`/${lang === "en" ? "en" : "ko"}/club/${encodeURIComponent(groupId ?? "")}/meetings/${encodeURIComponent(meetingId ?? "")}`} />;
}
