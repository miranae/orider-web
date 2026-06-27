import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../contexts/ToastContext";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { LocaleProvider } from "../../contexts/LocaleContext";
import { OriderThemeProvider } from "../../theme";
import { simulateLogin, simulateLogout, setDocData } from "../mocks/firebase";
import { createMockProfile } from "../fixtures/mockData";
import type { UserProfile } from "@shared/types";

interface ProviderOptions {
  route?: string;
  authenticated?: boolean;
  user?: { uid?: string; displayName?: string; email?: string; photoURL?: string };
  profile?: Partial<UserProfile> & Record<string, unknown>;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: ProviderOptions & Omit<RenderOptions, "wrapper"> = {},
) {
  const { route = "/", authenticated = false, user, profile, ...renderOptions } = options;

  if (authenticated) {
    const mockUser = {
      uid: user?.uid ?? "test-uid",
      displayName: user?.displayName ?? "Test User",
      email: user?.email ?? "test@example.com",
      photoURL: user?.photoURL ?? null,
    };
    simulateLogin(mockUser);
    // Set user profile in mock Firestore
    const mockProfile = createMockProfile({
      nickname: mockUser.displayName ?? "Test User",
      email: mockUser.email,
      photoURL: mockUser.photoURL,
      ...profile,
    });
    setDocData(`users/${mockUser.uid}`, mockProfile as unknown as Record<string, unknown>);
  } else {
    simulateLogout();
  }

  const localeUserId = authenticated ? (user?.uid ?? "test-uid") : null;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <ThemeProvider>
          <OriderThemeProvider>
            <AuthProvider>
              <LocaleProvider userId={localeUserId}>
                <ToastProvider>{children}</ToastProvider>
              </LocaleProvider>
            </AuthProvider>
          </OriderThemeProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
