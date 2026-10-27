import { vi } from "vitest";

/** Shared lightweight registry for activity page tests that render the real chart components. */
export const activityChartRegistryMock = {
  Chart: { register: vi.fn() },
  CategoryScale: class {},
  LinearScale: class {},
  LogarithmicScale: class {},
  BarElement: class {},
  LineElement: class {},
  PointElement: class {},
  ArcElement: class {},
  Title: class {},
  Tooltip: class {},
  Legend: class {},
  Filler: class {},
};
