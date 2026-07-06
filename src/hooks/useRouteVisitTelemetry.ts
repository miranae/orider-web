import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { recordRouteVisit } from "../services/routeLoopTelemetry";

export function useRouteVisitTelemetry(): void {
  const location = useLocation();
  const previousRoutePathRef = useRef<string | null>(null);

  useEffect(() => {
    recordRouteVisit({
      path: location.pathname,
      fromPath: previousRoutePathRef.current,
    });
    previousRoutePathRef.current = location.pathname;
  }, [location.key, location.pathname]);
}
