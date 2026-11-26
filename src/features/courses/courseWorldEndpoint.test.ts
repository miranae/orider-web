import { courseWorldEndpoint } from "./courseDetailAsset";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";

afterEach(() => { vi.unstubAllEnvs(); resetRuntimeConfigForTests(); });

it("운영 코스 신호는 운영 프로젝트·비에뮬레이터·런타임 설정이 모두 맞을 때만 고정 TLS 엔드포인트를 쓴다", () => {
  expect(courseWorldEndpoint("miranae-orider-g1")).toBeUndefined();
  resetRuntimeConfigForTests({ worldCourseSignalsEnabled: true });
  expect(courseWorldEndpoint("miranae-orider-g1")).toBe("wss://world.orider.co.kr/course-signals");
  expect(courseWorldEndpoint("another-project")).toBeUndefined();
  expect(courseWorldEndpoint(undefined)).toBeUndefined();
  resetRuntimeConfigForTests({ worldCourseSignalsEnabled: true, useEmulators: true });
  expect(courseWorldEndpoint("miranae-orider-g1")).toBeUndefined();
});

it("로컬 랩은 데모 프로젝트와 로컬 플래그가 모두 켜졌을 때만 루프백을 쓴다", () => {
  vi.stubEnv("DEV", true);
  vi.stubEnv("VITE_ORIDER_LOCAL_WORLD", "1");
  expect(courseWorldEndpoint("demo-orider-lab")).toBeUndefined();
  vi.stubEnv("VITE_ORIDER_LOCAL_COURSE_REDIS", "1");
  expect(courseWorldEndpoint("demo-orider-lab")).toBe("ws://127.0.0.1:19487/course-signals");
});
