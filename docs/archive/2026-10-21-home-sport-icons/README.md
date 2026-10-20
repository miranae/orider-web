# 홈 커스텀 종목 아이콘 백업

2026-10-21 사용자 요청으로 기본 아이콘을 복구하기 직전 원본을 보존했습니다.
원본 커밋: `2b4569a869964ec61937e3f97e371dec85983c55`. `SHA256SUMS`로 파일 무결성을 확인할 수 있습니다.

- `src/assets/`: 사용자 제공 픽셀 종목 시트와 실내 자전거 원본.
- `HomeActivitySportIcon.tsx`와 CSS: 종목별 자르기 좌표, 배경 필터, 크기, swim rear 선택을 포함한 당시 표시 매핑.
- `SportIcon.tsx`, `sportIconArtwork.ts`: 기본 Material 아이콘과 커스텀 후면 수영/사이클/러닝 SVG 도안.

기본 아이콘의 근거는 홈 커스텀 도입 커밋 `d862698f` 직전 `SportIcon.tsx`입니다.
기본은 Google Material Symbols Rounded 측면 사이클·러닝·수영(`third_party/material-symbols/` 라이선스)입니다.
복구 후 MTB·실내 자전거는 사이클, 트레킹은 러닝 기본 그림을 사용합니다. 세부 종목 이름과 접근성 설명은 유지합니다.

다시 적용하려면 이 폴더의 `src/` 파일을 동일한 저장소 경로로 복사한 뒤 import와 호출부를 검토하세요.
보관본은 런타임 import에 연결하지 않습니다. 디자인 실험 이력은 `docs/reviews/2026-10-19-home-mobile/sport-icons.md`를 참고하세요.
