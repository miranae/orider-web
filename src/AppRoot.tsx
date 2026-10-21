import { useLocation } from "react-router-dom";

import App, { isEmbeddedRoutePath } from "./App";
import ImpersonationBanner from "./components/ImpersonationBanner";
import { AuthProvider } from "./contexts/AuthContext";
import { DialogProvider } from "./contexts/DialogContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { OriderThemeProvider } from "./theme";

/** Keeps the normal web provider tree completely absent on embedded routes. */
export default function AppRoot() {
  const location = useLocation();
  const embedded = isEmbeddedRoutePath(location.pathname);

  return (
    <ThemeProvider>
      {/* 앱 WebView 임베드는 아직 HIG 이전 글자 크기 유지 */}
      <OriderThemeProvider typeScale={embedded ? 'legacy' : 'hig'}>
        {embedded ? (
          <App />
        ) : (
          <AuthProvider>
            <ToastProvider>
              <ImpersonationBanner />
              <DialogProvider>
                <App />
              </DialogProvider>
            </ToastProvider>
          </AuthProvider>
        )}
      </OriderThemeProvider>
    </ThemeProvider>
  );
}
