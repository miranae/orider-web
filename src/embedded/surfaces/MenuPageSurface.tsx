import { lazy, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { EmbeddedMenuPage } from "../menuPages";
import HubSurfaceFrame, { type HubSurfaceProps } from "./HubSurfaceFrame";
import EmbeddedSurfaceState from "./EmbeddedSurfaceState";

const Guidelines = lazy(() => import("../../pages/CommunityGuidelinesPage"));
const Feedback = lazy(() => import("../../pages/CreatePostPage"));
const ActivityEdit = lazy(() => import("../../pages/activity/ActivityEditPage"));

const AboutDocument = lazy(() => import("./AboutDocumentSurface"));
const ignoreFrameReady = () => {};
export default function MenuPageSurface({ page, ...props }: HubSurfaceProps & { page: EmbeddedMenuPage }) {
  const { t } = useTranslation(["common", "legal", "activity"]);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (page !== "feedback" || params.get("type") === "inquiry") return;
    const next = new URLSearchParams(params); next.set("type", "inquiry");
    setParams(next, { replace: true });
  }, [page, params, setParams]);
  const title = page === "about" ? t("common:footer.about") : page === "community-guidelines"
    ? t("legal:guidelines.pageTitle") : page === "feedback" ? t("common:footer.feedback") : t("activity:edit.title");
  if (page === "feedback" && params.get("type") !== "inquiry") return <EmbeddedSurfaceState title={title} loading />;
  return <HubSurfaceFrame {...props} onReady={page === "about" ? ignoreFrameReady : props.onReady} title={title} testId={`embedded-${page}`}>
    {page === "about" ? <AboutDocument onReady={props.onReady} onError={props.onError} /> : page === "community-guidelines" ? <Guidelines />
      : page === "feedback" ? <Feedback /> : <ActivityEdit />}
  </HubSurfaceFrame>;
}
