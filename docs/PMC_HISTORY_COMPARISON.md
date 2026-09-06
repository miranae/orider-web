# PMC 장기 이력·연도 비교

구현 기준: 2026-09-06. 공개 웹 `/fitness` 및 앱 임베드 `/embed/fitness`의 공용 PMC 표시 기능. 배포 상태를 뜻하지 않는다.

## 표시 계약

| 기간 | 표시 |
|---|---|
| 30 / 90일 | 일별 정본 값 |
| 180 / 360일 | 월요일 시작 주평균 |
| 3년 | 이번 달 포함 36개 달의 월평균 |
| 전체 | 현재 제공된 이력의 월평균 |
| 연도별 비교 | 같은 월 기준 CTL 및 별도 TSB 차트 |

CTL·ATL·TSB는 기존 일별 값 각각의 산술평균이며 EMA를 재계산하지 않는다. 부하는 `dailyLoad` 합계다. 시간·거리 필드는 현재 시계열 계약에 없으므로 합계로 표시하지 않는다. 부분 주·월과 누락을 표시하고, 원본에 없는 날짜를 0으로 만들지 않는다. 동일 날짜의 완전히 같은 값은 한 번만 집계하고, 상충하는 값은 해당 날짜를 제외한다.

진행 중인 달과 과거의 전체 달은 관측 기간이 다르므로 평균·합계 해석에 주의한다. 날짜가 존재한다는 사실은 실제 수집 완전성을 보장하지 않는다. 서버가 생성한 0 부하만으로 실제 휴식과 동기화 누락을 구분할 수 없다.

## 데이터·화면 경계

- `useFitnessModel`이 구독한 일별 시계열을 사용한다. 표시 기간 상태는 `PmcHistoryPanel` 안에만 있으며 기존 활동 상세 조회 범위를 늘리지 않는다.
- 서버 저장 이력은 현재 백엔드 `MAX_TIMESERIES_POINTS=1500` 정책을 따른다. ‘전체’는 평생 이력이 아니다. 사용자별 실제 보유 기간이 다르다.
- 정본 스키마 검증에 실패하면 기존 활동 기반 대체 이력을 제한된 자료로 표시한다. 유효한 빈 정본은 빈 상태를 유지한다.
- 통합 종목은 기존 통합 일별 시계열을 사용한다. 세 종목 모두 정본으로 확인된 경우에만 정본 출처로 표시한다.
- 최신 KPI·코치·주간 요약의 계산과 PMC 선택 구간의 평균은 별개다.
- 기존 목표 예측·활동 마커는 ‘일별 상세’, 통합 종목 기여도 차트는 별도 상세 섹션에 유지한다.
- 앱의 임베드 Fitness는 공유하지만 네이티브 Status의 별도 PMC 화면은 변경하지 않는다.
- 백엔드·권한 규칙·운영 데이터·기기 전송을 수정하지 않는다.

## 검증 진입점

```sh
npx vitest run src/features/fitness/pmcHistory.test.ts src/features/fitness/components/PmcHistoryPanel.test.tsx src/hooks/useFitnessModel.test.tsx src/pages/FitnessPage.test.tsx
npx playwright test --config e2e/pmc-history.config.ts
npm run lint:budget
npm run quality:budget
npm test
npm run build
```

전용 Playwright 설정은 로컬 합성 자료로 실제 컴포넌트를 렌더하며 Firebase 계정·에뮬레이터가 필요 없다. 한국어/영어 × 데스크톱/390px에서 월별 선택·키보드 커서·연도 비교·축 라벨 겹침·가로 넘침을 확인한다. 실제 계정 데이터의 운영 화면 검증을 대체하지 않는다. 스크린샷은 `test-results/pmc-history`에 생성된다.

2026-09-07 로컬 검증: 전체 Vitest 424파일·3,613테스트 및 후속 스크립트/계약 검사 통과. 타입 검사·lint:budget·quality:budget 통과. 마지막 모바일 버튼 배치 수정 후 컴포넌트 5테스트, 브라우저 4시나리오, 프로덕션 빌드 재통과. 독립 코드·모바일 스크린샷 검토 통과. 머지·배포 및 실제 계정 검증은 수행하지 않았다.

합성 데이터 검수 화면: [3년 모바일](assets/pmc-history/3year-mobile.png), [연도별 비교 데스크톱](assets/pmc-history/year-comparison-desktop.png).
