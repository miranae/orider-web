import { Activity, useEffect, useState, type ReactNode } from "react";

/** 숨긴 표면의 React 상태는 보존하고 구독·타이머 효과는 정리한다. 인증 브리지는 이 경계 밖에 둔다. */
export function RetainedSurfaceActivity({ foreground, children }: { foreground: boolean; children: ReactNode }) {
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const refresh = () => setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  return <Activity mode={foreground && documentVisible ? "visible" : "hidden"}>{children}</Activity>;
}
