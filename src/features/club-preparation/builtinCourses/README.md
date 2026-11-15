# 앱 내장 실내 코스 GPX

클럽 모임 코스로 고를 수 있는 앱 내장 실내 코스(`builtin_*`)의 GPX 다(orider-g1-web#3677).

- 정본: `miranae/orider-g1-app` `ios/ORider/Resources/DefaultCourses/*.gpx` 를 **바이트 그대로** 복사했다
  (Android `android/app/src/main/assets/default_courses/` 는 일부 파일 머리말 공백만 다르고 트랙은 같다).
- id·이름 정본: orider-g1-app `shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/trainer/BuiltInVirtualCourses.kt`,
  앱 ko 문자열 `indoor_builtin_*`.
- **앱과 항상 같아야 한다.** 앱에서 코스를 추가·수정하면 이 폴더, `../builtinCourseCatalog.ts`,
  서버 허용 목록(orider-g1-web `functions/src/event/club-meeting-builtin-courses.ts`)을 함께 갱신한다.
- 경로: OpenStreetMap contributors (ODbL), BRouter 로 생성.
