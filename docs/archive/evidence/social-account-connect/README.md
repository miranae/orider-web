# 기존 소셜 계정 연결 확인 화면

실제 `SocialAuthCallbackPage`와 디자인 시스템 Button/CSS를 Vite에서 렌더링한 로컬 fixture입니다. 외부 인증·Firestore·분석 호출은 mock으로 대체했습니다. 실제 OAuth 성공 증거는 아닙니다.

- `ko-mobile.png`: 한국어, 390 × 844
- `en-desktop.png`: 영어, 1280 × 800
- 두 화면 모두 수평 overflow와 JavaScript 오류 없음. 사용자 확인 버튼 클릭 후 `startSocialAuth("naver", "link", "/settings/account", true)` 호출을 확인했습니다.
- 취소·세션 변경 차단·데이터 충돌 안내는 콜백 컴포넌트 회귀 테스트에서 확인합니다.

검증: 로그인 콜백/소셜 서비스/설정 연결 52개 테스트, `lint:budget`, `quality:budget`, 타입 검사 및 production build 통과. 로컬 기존 .env에는 `VITE_ORIDER_AI_API_BASE`가 없어 빌드 검증에만 `http://127.0.0.1:5001`을 명시했습니다. 이 산출물은 배포하지 않았습니다.

배포 순서: 서버의 빈 소셜 계정 연결 처리와 인덱스 준비 상태를 먼저 확인한 뒤 웹을 배포합니다. 양쪽에 데이터가 있는 두 계정의 일반적인 자동 병합은 지원하지 않습니다.
