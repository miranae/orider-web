# 장수 트레이닝 표면 requestId 전환

웹은 `bootstrap.ready`에서 `surface-selection-request-id-v1` capability를 광고하고,
`host.surfaceSelected`로 받은 `requestId`를 해당 선택 세대의 모든
`surface.ready`·`surface.error` 응답에 그대로 돌려준다. Activity Analysis의 기존 무ID
응답 계약은 바꾸지 않는다.

배포 순서는 다음과 같다.

1. capability가 없으면 legacy 응답을 허용하고, 있으면 `requestId`를 엄격히 검사하는 앱을 먼저 배포한다.
2. 그 다음 이 웹 버전을 배포해 capability를 광고한다.
3. 웹 롤백으로 capability가 사라지면 새 앱도 legacy 검증으로 자동 복귀한다.

웹을 먼저 배포하면 기존 앱은 capability를 무시하므로 동작하지만, 엄격 검증이 실제로 활성화되는
시점을 통제하기 위해 앱 선배포를 기본 순서로 사용한다.
