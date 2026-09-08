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
- 통합 종목은 기존 통합 일별 시계열을 사용한다. 날짜별 세 종목의 저장 포인트가 모두 있으면 ‘종목 합산’, 없는 입력을 감쇠로 보완하면 ‘추정 계산’으로 표시한다. 문서가 유효하다는 사실만으로 전체 통합 이력을 서버 정본으로 표시하지 않는다.
- 최신 KPI·코치·주간 요약의 계산과 PMC 선택 구간의 평균은 별개다.
- 기존 목표 예측·활동 마커는 ‘일별 상세’, 통합 종목 기여도 차트는 별도 상세 섹션에 유지한다.
- 앱의 임베드 Fitness는 공유하지만 네이티브 Status의 별도 PMC 화면은 변경하지 않는다.
- 백엔드·권한 규칙·운영 데이터·기기 전송을 수정하지 않는다.

## 운동부하 반영과 PMC 계산

운동부하는 활동 종료 후 계산되며 같은 날 완료된 활동의 합계가 일일 부하다. 추가 운동이 반영되면 해당 날짜의 누적 부하와 PMC 값이 갱신된다. 표시 집계는 최신 일별 값을 그대로 사용하므로 운동마다 감쇠를 추가 적용하지 않는다. 종목을 번갈아 운동해도 각 날짜에 저장된 다른 종목의 0 부하는 정상 입력이다.

`PmcHistoryPoint.loadStatus`는 `final`(현재 입력의 부하 산출 완료) / `snapshot`(이전 계약 저장값) / `unconfirmed`로, `calculationStatus`는 계산 출처와 `pending` / `failed` / `stale`(처리 지연)를 독립 관리한다. 주·월은 부하 반영 일수와 PMC 계산 일수를 따로 센다. 누락된 입력은 부하 미확인으로 남기고, 계산값이 존재해도 실제 활동이 확인됐다고 표시하지 않는다. 동일 값의 중복은 보수적인 상태를 합치고 숫자를 유지한다.

후속 백엔드 계약은 기존 timeseries 문서에 `loadSnapshot`(입력 revision/digest·조회 시점·날짜별 부하·품질)과 `pmc`(대기/처리/실패·처리 revision·deadline)를 추가한다. 저장된 새 부하가 있어도 처리 revision이 다르면 기존 PMC 수치는 이전 계산으로 표시한다. 새 날짜에 PMC가 없으면 수치를 `null`로 유지한다. 빈 활동 조회의 명시적 0과 처리 완료가 모두 확인된 경우만 0 PMC를 표시한다. `inputInvalidatedAt`이 조회 시점보다 새로우면 부하는 미확인, PMC는 대기 상태다. 프로세스가 중단돼 새 문서가 오지 않아도 deadline의 단일 타이머가 처리 지연으로 바꾼다.

‘확정’은 현재 조회된 입력에 대한 부하 산출 완료이며 시간 기반 추정이 포함될 수 있다. 모든 스트림/메트릭 인입 완료나 하루 최종 확정이 아니다. 종목별 조회 범위가 없는 날짜는 휴식으로 추정하지 않는다. 통합 화면은 `fitness/current`의 세 종목 revision과 현재 UTC 날짜를 확인하고 필요한 경우 `revalidateTraining({ discipline: 'tri' })`로 세 종목 부하/PMC를 갱신한다. 운동하지 않은 종목도 이때 명시적 0 입력을 받는다. 기존 KPI 입력은 별도 보존한다.

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

2026-09-07 상태 분리 후 검증: 관련 5파일 70테스트 통과 후 KPI 입력 보존 테스트를 추가해 영향받는 2파일 29테스트 재통과(관련 테스트 총 71개). `tsc -b`와 변경 파일 ESLint 통과. 독립 브라우저 검증 한국어/영어 × 데스크톱/모바일 4시나리오 통과. 위의 전체 3,613테스트 기록은 상태 분리 이전 검증이며 이번에 전체 테스트를 재실행한 것은 아니다.

2026-09-07 백엔드 수명주기 연동 후 최종 검증: 관련 Vitest 6파일 94테스트, `tsc -b`, 변경 파일 ESLint 통과. 실제 wire fixture 기반 PMC 대기/실패/처리완료 및 기존 이력의 브라우저 8시나리오(한국어/영어 × 데스크톱/모바일) 통과. 새 날짜 부하만 있는 null PMC, 알려진 빈 입력의 처리된 0, 잘못된 metadata, 새 snapshot 없는 deadline 경과, 통합 revision 재검증을 포함한다. 백엔드 실 Firestore emulator는 3시나리오 통과했으며 운영 배포/실계정 증거는 아니다.

최종 리뷰의 손상된 계산 날짜 방어 후 `useFreshTraining` 18테스트와 TypeScript/ESLint 재통과(관련 테스트 총 95개). 기존 브라우저 표시 동작은 변경하지 않았다.

## 2026-09-08 리뷰 수정

- 데스크톱·통합·모바일의 PMC 기준일은 정본과 같은 UTC 날짜를 사용한다. 활동·계획의 로컬 날짜는 유지한다. 한국 새벽의 빈 ‘오늘’과 음수 UTC 지역에서 최신 포인트가 잘리는 문제를 함께 방지한다.
- 단일 종목의 화면 진입 신선도는 projection과 timeseries의 서버 확정 snapshot을 모두 기다린다. 실패·미처리 revision·새 입력 무효화·이전 UTC 날짜는 재검증하며, 기존 계약 사용자만 projection 기준을 유지한다. 인입 비교에는 PMC 완료 시각이 아니라 실제 입력 조회 시각(`loadSnapshot.asOf`)을 사용한다.
- 통합 `processingState=processed`는 입력의 완전성과 별개다. 과거 unknown 입력 때문에 `state=stale`여도 최신 세 종목 revision의 처리가 끝났으면 재계산하지 않는다. 새 입력·날짜 변경·3시간 경과에는 기존대로 갱신한다.
- 새 입력 무효화의 대기는 최신 `inputInvalidatedAt + 60초`로 제한한다(서버 시도 예산과 동일). 이전 시도의 실패나 deadline을 상속하지 않고, 추가 snapshot 없이도 단일 타이머가 ‘처리 지연’으로 전환한다.

검증: 관련 Vitest 6파일 119테스트, `tsc -b --pretty false`, 변경 파일 ESLint(경고 0), `npm run build` 통과. 독립 브라우저 검증 10시나리오 통과(기존 8 + Asia/Seoul 새벽·America/Los_Angeles 저녁의 실제 UTC 날짜 선택 2). 전체 테스트 재실행·머지·운영 배포는 하지 않았다.

후속 통합 신선도: `fitness/current.processingSourceAsOf`는 세 종목 입력 조회 시각의 최솟값이다. 통합 문서 쓰기 시각이 최신이어도 이 값이 3시간 이전이거나 UTC 날짜/최근 인입을 포함하지 못하면 재검증한다. `processingState`가 있는 계약에서 원본 시각이 누락·손상된 경우도 재검증한다. 이전 계약(`processingState` 없음)은 기존 `computedAt` 기준을 유지한다. 관련 hook 37테스트·TypeScript·변경 파일 ESLint 통과.
