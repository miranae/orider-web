import { lazy } from "react";
import { useTranslation } from "react-i18next";
import { GlossaryProvider } from "../../components/common/GlossaryProvider";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";

const GroupsPage = lazy(() => import("../../pages/group/GroupsPage"));

/** 앱 클럽 탭: 웹 클럽 허브(/clubs) 목록을 그대로 그린다. */
export default function ClubsSurface(props: HubSurfaceProps) {
  const { t } = useTranslation("common");
  return (
    <HubSurfaceFrame {...props} title={t("nav.clubs")} testId="embedded-clubs">
      <GlossaryProvider><GroupsPage /></GlossaryProvider>
    </HubSurfaceFrame>
  );
}
