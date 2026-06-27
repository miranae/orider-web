// 테스트 환경에서 i18next를 동기 초기화 — Suspense 회피
// 앱 런타임은 HttpBackend 로 일부 네임스페이스를 지연 로드하지만, 테스트엔 백엔드가 없으므로
// 모든 ko 네임스페이스를 정적으로 등록한다 (미등록 시 컴포넌트가 키를 그대로 렌더 → 텍스트 단언 실패).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import koActivity from "../../i18n/resources/ko/activity.json";
import koAthlete from "../../i18n/resources/ko/athlete.json";
import koAuth from "../../i18n/resources/ko/auth.json";
import koBoard from "../../i18n/resources/ko/board.json";
import koCommon from "../../i18n/resources/ko/common.json";
import koCourse from "../../i18n/resources/ko/course.json";
import koDashboard from "../../i18n/resources/ko/dashboard.json";
import koEvent from "../../i18n/resources/ko/event.json";
import koFitness from "../../i18n/resources/ko/fitness.json";
import koFriends from "../../i18n/resources/ko/friends.json";
import koGroup from "../../i18n/resources/ko/group.json";
import koLegal from "../../i18n/resources/ko/legal.json";
import koMigration from "../../i18n/resources/ko/migration.json";
import koMypage from "../../i18n/resources/ko/mypage.json";
import koSegment from "../../i18n/resources/ko/segment.json";
import koSettings from "../../i18n/resources/ko/settings.json";
import koTraining from "../../i18n/resources/ko/training.json";

const ko = {
  activity: koActivity,
  athlete: koAthlete,
  auth: koAuth,
  board: koBoard,
  common: koCommon,
  course: koCourse,
  dashboard: koDashboard,
  event: koEvent,
  fitness: koFitness,
  friends: koFriends,
  group: koGroup,
  legal: koLegal,
  migration: koMigration,
  mypage: koMypage,
  segment: koSegment,
  settings: koSettings,
  training: koTraining,
};

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: "ko",
    fallbackLng: "ko",
    ns: Object.keys(ko),
    defaultNS: "common",
    resources: { ko },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}
