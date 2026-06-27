import i18n, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { pathDetector, SUPPORTED_LANGS } from './detector';

// 초기 네임스페이스(앱 첫 화면에 필요) — 번들에 인라인해 첫 로드 HTTP 왕복을 없앤다.
// (perf, 2026-06) 이전엔 i18next-http-backend 가 init 시 /locales/{lng}/{ns}.json 10개를
// 개별 fetch 했고, react.useSuspense:true 라 그 JSON 이 다 도착할 때까지 텍스트 렌더가
// 막혀 LCP 의 렌더지연(~2.7s)을 키웠다. 정적 import → resources 로 묶으면 동기 사용 가능
// → Suspense 블록·10 왕복 제거. 나머지 on-demand ns(board/course/event 등)는 그대로
// HttpBackend 가 라우트 진입 시 lazy fetch (partialBundledLanguages).
import koCommon from './resources/ko/common.json';
import koAuth from './resources/ko/auth.json';
import koDashboard from './resources/ko/dashboard.json';
import koActivity from './resources/ko/activity.json';
import koSettings from './resources/ko/settings.json';
import koMigration from './resources/ko/migration.json';
import koLegal from './resources/ko/legal.json';
import koTraining from './resources/ko/training.json';
import koFitness from './resources/ko/fitness.json';
import koLab from './resources/ko/lab.json';
import enCommon from './resources/en/common.json';
import enAuth from './resources/en/auth.json';
import enDashboard from './resources/en/dashboard.json';
import enActivity from './resources/en/activity.json';
import enSettings from './resources/en/settings.json';
import enMigration from './resources/en/migration.json';
import enLegal from './resources/en/legal.json';
import enTraining from './resources/en/training.json';
import enFitness from './resources/en/fitness.json';
import enLab from './resources/en/lab.json';

const detector = new LanguageDetector();
detector.addDetector(pathDetector);

export const NAMESPACES = [
  'common',
  'auth',
  'dashboard',
  'activity',
  'settings',
  'migration',
  'legal',
  'training',
  'fitness',
  'lab',
] as const;

// 번들 인라인된 초기 리소스 — NAMESPACES 와 1:1. 여기 없는 ns 는 HttpBackend 가 lazy 로드.
const resources: Resource = {
  ko: {
    common: koCommon,
    auth: koAuth,
    dashboard: koDashboard,
    activity: koActivity,
    settings: koSettings,
    migration: koMigration,
    legal: koLegal,
    training: koTraining,
    fitness: koFitness,
    lab: koLab,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    activity: enActivity,
    settings: enSettings,
    migration: enMigration,
    legal: enLegal,
    training: enTraining,
    fitness: enFitness,
    lab: enLab,
  },
};

// isInitialized 가드 — 테스트는 src/__tests__/mocks/i18nTestSetup 이 17개 ns 전체를
// resources 로 먼저 동기 초기화한다. 가드 없이 여기서 다시 init() 하면 (1) 위 초기
// resources(초기 10개 ns)가 테스트의 전체 resources 를 덮어쓰고 (2) detector 가 재동작해
// lng 가 바뀌어 on-demand ns(athlete/segment/friends 등) 텍스트 단언이 깨진다. 프로덕션은
// 이 파일이 유일한 초기화 지점이라 가드가 동작에 영향 없음.
if (!i18n.isInitialized) {
  void i18n
    .use(HttpBackend)
    .use(detector)
    .use(initReactI18next)
    .init({
    supportedLngs: [...SUPPORTED_LANGS],
    fallbackLng: 'ko',
    // 인라인된 초기 ns 는 resources 로 즉시 사용. 그 외 ns 는 backend 가 보충 로드.
    resources,
    partialBundledLanguages: true,
    ns: [...NAMESPACES],
    defaultNS: 'common',
    backend: {
      // resources 에 없는 ns(board/course/event/group/friends/segment/athlete/mypage 등)만
      // 실제로 여기로 fetch. 초기 10개 ns 는 번들에 있어 네트워크 요청이 발생하지 않는다.
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['path', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
  });
}

export default i18n;
