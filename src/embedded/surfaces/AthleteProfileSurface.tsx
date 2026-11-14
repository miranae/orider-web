import { lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { isEmbeddableAthleteId } from "../hubNavigation";
import EmbeddedSurfaceState from "./EmbeddedSurfaceState";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";

const AthletePage = lazy(() => import("../../pages/AthletePage"));

/** 모르는 하위 경로는 프로필 첫 화면으로 돌린다. 언어·선수는 바깥 라우트 값이다. */
function AthleteProfileRedirect() {
  const { lang, userId } = useParams();
  return <Navigate replace to={`/${lang ?? "ko"}/embed/athlete/${encodeURIComponent(userId ?? "")}`} />;
}

/** 내 프로필이면 웹의 `/athlete/me` 해석과 같게 넘긴다 — 임베드 밖 `/athlete/me` 로 다시 가지 않게 한다. */
function AthleteProfileIndex() {
  const { userId } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation("common");
  // 예약 경로(`me`)·잘못된 ID 는 열지 않는다 — 앱은 남의 uid 만 넘긴다.
  if (!isEmbeddableAthleteId(userId)) return <EmbeddedSurfaceState title={t("nav.profile")} message={t("embeddedStatus.unavailable")} />;
  const own = !!user && !user.isAnonymous && user.uid === userId;
  return <AthletePage meUserId={own ? userId : undefined} />;
}

/**
 * 앱 선수 프로필: 웹 선수 프로필(`/athlete/:userId`)을 그대로 그린다 — 친구 요청·구독 버튼 포함.
 * 프로필 밖 링크(활동·다른 선수·클럽 등)는 `navigation.openNative` 로 앱에 넘긴다(hubNavigation).
 * 뒤로가기·닫기는 앱 화면이 맡는다.
 */
export default function AthleteProfileSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  return (
    <HubSurfaceFrame {...props} title={t("nav.profile")} testId="embedded-athlete-profile">
      <Routes>
        <Route index element={<AthleteProfileIndex />} />
        <Route path="*" element={<AthleteProfileRedirect />} />
      </Routes>
    </HubSurfaceFrame>
  );
}
