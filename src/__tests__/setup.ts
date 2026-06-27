import "@testing-library/jest-dom/vitest";
import "./mocks/firebaseMockSetup";
import "./mocks/i18nTestSetup";

// matchMedia mock (for dark mode, responsive)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// IntersectionObserver mock (jsdom 미지원 — ActivityCard 의 lazy 맵 캡처 등에서 사용)
// observe() 시 즉시 isIntersecting:true 콜백을 발화해 "요소가 보이는" 실제 동작을 재현한다.
class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  private cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element): void {
    this.cb(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this,
    );
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
});
Object.defineProperty(globalThis, "IntersectionObserver", {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
});

// Clipboard mock
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(""),
  },
});

// Leaflet mock (avoid jsdom canvas issues)
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => children,
  TileLayer: () => null,
  Polyline: () => null,
  useMap: () => ({ fitBounds: vi.fn(), invalidateSize: vi.fn() }),
}));

vi.mock("leaflet", () => ({
  default: { icon: vi.fn(), divIcon: vi.fn() },
  icon: vi.fn(),
  divIcon: vi.fn(),
  latLngBounds: vi.fn(() => ({
    extend: vi.fn().mockReturnThis(),
    isValid: () => true,
  })),
}));

// Chart.js mock (avoid canvas issues)
vi.mock("react-chartjs-2", () => ({
  Bar: () => null,
  Line: () => null,
  Doughnut: () => null,
}));

vi.mock("chart.js", () => ({
  Chart: { register: vi.fn() },
  CategoryScale: class {},
  LinearScale: class {},
  BarElement: class {},
  LineElement: class {},
  PointElement: class {},
  ArcElement: class {},
  Tooltip: class {},
  Legend: class {},
  Filler: class {},
}));

// SVG import mock
vi.mock("../assets/icon.svg", () => ({ default: "/icon.svg" }));

// Suppress console.error from React in tests (optional: remove if you want to see them)
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    // Suppress known React / act() warnings
    if (msg.includes("act(") || msg.includes("not wrapped in act")) return;
    originalConsoleError(...args);
  };
});
afterAll(() => {
  console.error = originalConsoleError;
});
