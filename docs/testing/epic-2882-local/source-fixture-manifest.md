# R0 원본 비교 fixture manifest

2026-10-26 기존 로컬 증거를 파일/JSON 단위로 확인한 목록입니다. 문서 작성 기준 WEB `d211292ba9586d3ea62546f21957191e6549f0d0`; 아래 실행은 각 행에 적힌 과거 artifact에 귀속됩니다. 현재 HEAD에서 전부 재실행했다는 의미가 아닙니다. 제품 수정, 새 성능 실행, 원격 작업, 자격증명 파일 열람 없이 작성했습니다.

외부 증거 루트 **E** = `/Users/kyoungnam/Documents/Codex/2026-10-26/orider-epic-2882`. 이 문서의 `E/...`는 해당 절대 경로를 뜻합니다. 모든 원본은 가명 합성 자료입니다. 센서 채널에 숫자가 들어 있다는 사실은 실제 기기의 정확도 검증이 아닙니다. `source=orider`로 저장된 파일 가져오기도 앱 직접 녹화와 구분합니다. `sourceLayer=inline_streams`는 당시 계산 엔진의 GCS JSON fallback 명칭이며 앱 raw-parts 수집 증거로 바꿔 부르지 않습니다.

## 소스→기대 정의→producer/API/UI 대응

| ID / 입력 | 센서·시간·환경 및 기대 정의 | 실제 producer / API 증거 | 실제 UI 증거와 확인값 | 남은 범위 |
|---|---|---|---|---|
| F1 독립 FIT / F2 독립 TCX | 기존 `generateFit`/`generateTcx`가 만든 601점/600초. HR140, cadence80, power200..229는 합성 계측 채널. 활동 시점 FTP/심박 역치 없음. | `E/import-formats/upload-results.json`: 각각 REST201. `E/gpx-canonical/process-format-0-results.json`, `process-format-1-results.json`: 자동 queued job을 정상 dueAt 이후 각각 한 번 실제 processor로 처리, done/v41/stream unchanged. artifact `bf67d93039e9`. `E/import-formats/records.json`과 ID로 결합. | `E/import-formats/validation-summary.json`, `fit-analysis.png`, `tcx-analysis.png`: avgHR140, avgPower214, NP214.5W, 측정 파워 차트. 역치 부족과 시간 기반 추정 부하 안내, pending 아님. 저장 거리1.25km/600초. | 제조사별 모든 FIT 변형·센서 실측 정확도·실제 스케줄러 전달 미검증. 이 artifact의 dense PDC `unaligned_elapsed_axis`는 저장 결과에 남아 있으며 전체85점 검증으로 확대하지 않음. |
| F3 ZIP(GPX+TCX+손상 FIT+TXT) / 동일 ZIP 재업로드 | 유효2개와 corrupt FIT1개, unsupported TXT1개. GPX는 GPS/고도/시각만, TCX는 F1/F2와 같은 합성 센서. 서로 다른 시작 시각으로 우발 중복을 피함. | `E/import-formats/upload-results.json`: 첫201 total3/created2/failed1; TXT는 처리 전 제외. 반복201 created0/skipped2/failed1 및 동일 ID. `process-format-2-results.json`, `process-format-3-results.json` 실제 processor. `resource-manifest.json` 정확4활동. | `zip-upload.png`, `zip-repeat-upload.png`, `zip-gpx-analysis.png`, `zip-tcx-analysis.png`, `validation-summary.json`. GPX HR/power/NP null 및 측정 파워 차트 없음; TCX avgHR140/avgPower214/NP214.5. | ZIP 최대용량·50entry 스트레스/모든 손상 패턴 미검증. 시간 추정부하를 센서 TSS로 해석하지 않음. |
| K1 설정 UI에서 KST 먼저 선택→GPX | GPS/고도/시각601점,600초; HR/power/cadence 없음. 첫 coach/일지 전 Asia/Seoul 명시. | `E/import-kst/direct-timezone-results.json`, `direct-result.json` REST201, `E/gpx-canonical/process-kst-job-results.json` 실제 정상 due processor, `direct-revalidate-result.json` 실제 SDK1회. artifact `bf67d93039e9`. | `direct-period-results.json`, `direct-period-period.png`, `direct-period-log.png`: 1.25km를 UI1.3km,10분/5m; 부하7은 time/reliable=false 추정. 시작 PMC 미확인, 10/25 끝 CTL0.1/ATL0.5/TSB-0.3. 센서 없는 존은 미확인/불완전. | 기간 status partial을 complete로 치환하지 않음. 첫 기존 import 계정 UTC 이력은 별도로 보존; KST로 재분류했다는 주장 없음. |
| K2 미설정 신규 계정→실제 onboarding→KST 자정 경계 GPX | 원본 시작 `2026-10-19T15:30:00Z` = KST10/20 00:30. 601점/600초, GPS only. timezone 수동 저장 없음. | 실제 `ensureUserProfile` 및 onboarding 뒤 raw timezone absent. `E/import-unset-timezone/actual-profile-before-marker.json`, `onboarding-done.json`, `direct-result.json`; `E/gpx-canonical/process-fresh-default-results.json` 실제 due processor(a40a029fab3b, 앞에 preflight JSON이 붙은 다중 JSON 로그임); `direct-revalidate-result.json`. | `initial-diary-results.json`/`initial-diary-log.png`: 계산 전에도 KST10/20. `direct-period-results.json`/period·log PNG 및 서버 `E/gpx-canonical/period-fresh-default-after.json`: week7/session1/byDay[7,0,0,0,0,0,0],month7,periodload7. 생애 초기 KST 기준, time 추정부하·시작 PMC 미확인 보존. | 기존 UTC 이력의 변경/마이그레이션 검증 아님. 없는 원시 timezone 필드를 KST로 직접 써 넣지 않음. |
| M1 0W+정지 GPX / M2 실내 센서 GPX | M1: 601점/600초, 100개의 정지 거리 edge,0W 구간과200W 구간; device speed·timer pause 증거 없음. M2: indoor_cycling→VirtualRide,180W/HR150/cadence 채널. **VirtualRide 유형과 가상 추정 파워는 다름**(isVirtualPower=false). | `E/r42-source-matrix/before.json`, `after.json`, `results.json`: 실제 REST201 + processor, FTP250→300/LTHR170→180/maxHR190→195 변경 후 재계산, 원본 digest/updateTime 불변. d7120dbc485f. M1 avgPower100/NP166.913 유지, TSS7.4417→5.1679, power zones 변경; M2 avgPower/NP180,HR150,TSS8.6544→6.01. | M2는 `E/performance-final-fresh-account/results.json`의 owner_analysis60회 실제 존 준비 성공(같은 activityId), **완전한 모든 metric 시각검증은 아님**. M1의 이 artifact는 moving600/pause0을 기록: 아래 C1에서 결함 해결을 별도 검증. | HR 존은 두 fixture 모두 같은 존에 남음: LTHR 변경에 따른 존 이동 입증 불가. FTP 변화·저장 context 검증과 분리. 가상 파워 추정 엔진/기기 실내 녹화 미검증. d712 성능을 후속 artifact로 이식하지 않음. |
| C1 정지 분모 수정 후 새 GPX | M1과 동일한 정지/파워 형태이지만 별도 원본/계정. 파일의 elapsed600초를 앱 native moving으로 오인하지 않도록 기준 분리. 평균100W는 0W 포함 원본 평균이며 정지 제외 평균을 새로 주장하지 않음. | `E/r42-clock-basis/results.json`: 실제 REST201→queued due processor→동일 source 명시 재계산2회. a09b0b3feb93. 세 결과 모두 moving500/pause100/duration600,avgPower100,power zones[200,300,0…],source digest와 streamUpdateTime 불변. | `browser-results.json`, `mobile-analysis.png`: actual SDK/REST200, 분석상 이동0:08:20/정지0:01:40/총경과0:10:00,실측 평균100W,FTP300/체중70kg,390px overflow=false/errors[]. | GPS 관측속도 기반 분석상 정지이며 실제 타이머 pause marker/하드웨어 기록 완전성 입증 아님. M1 과거 실패를 삭제하거나 현재 실패로 오인하지 않음. |
| R1 V2 경로 forward600/720·reverse600·partial300 | 각601 GPS/고도/시각점. 전진 같은코스600/720초;역방향600초;부분경로300초,0.5초 간격. HR/power/cadence 없음. | `E/route-import-v2/upload-results.json`4개201; `metrics-executed.json`4done/stream unchanged; `index-executed.json`4ready. `source-axis-proof.json`: V2receipt와 풀어낸 저장 payload digest일치, exact time axis 0/500/1000ms 유지(정수 canonical0/1/1과 구분). 35dc68a3ea10. | `pair-*-results.json`/PNG: 동일방향·역방향·부분경로 actualUI; 부분45.3%는 관측 geometry. 최종 d3f9cc5effbf `final-schema2-api-results.json`/`final-schema2-ui-results.json`: eligible2/excluded2/unavailable0,best600sec,verified_recorded_best. `final-source-return.json`: 원활동 왕복. | `physicalRideCompleteness=unknown` 유지. 저장된 시점의 관측구간 최고이며 현실 모든 주행/전체 라이딩 완전성/현재 전역PB 아님. 초기35dc unavailable2 표기는 후속schema2 excluded2로 구분된 과거 checkpoint. |

## 보완적인 자체 raw-parts 원천

`E/full-stack/raw-native-compute-results.json`은 7축(watts/HR/cadence/distance/velocity/altitude/latlng) 각601 CSV 표본을 로컬 Storage에 쓰고 실제 upload reservation→finalize handler→processActivityMetricsRun을 통과한 기록입니다. raw_parts/v41,6km/600초,avgPower220/NP221.879459/HR145,고도상승10m(기록 summary12m와 정본 평활 정의가 다름). `raw-native-readback-results.json`의 owner REST/overview/public 결과를 activityRevision `ar_a997a47c097eb6a726a93e7b`로 결합합니다. CSV 파일을 이 문서 작성 시 별도 로컬 원본으로 확보하지 않았으므로 **CSV 원본 파일 SHA256은 미확인**입니다. generator script SHA를 CSV 원본 해시처럼 제시하지 않습니다. 앱 기기의 실제 수집/중단·복구 완전성 증거는 아닙니다.

## 기대값과 허용 오차의 명세 상태

- 원본 파일 SHA256/ZIP member SHA256은 아래 실파일 바이트로 이번 문서 작성 때 다시 계산했습니다. 서버의 `streamPayloadDigest`, `sourceContentDigest`, `routeInputRevision`과 서로 다른 바이트/정의이므로 같은 hash라고 가정하지 않습니다.
- HTTP201/생성·중복·실패 수, source unchanged, 600/720/300초 원본 시각축과 C1의500/100초 분리는 해당 fixture의 구체 기대값/회귀입니다. 이것이 모든 실사용 원본에 대한 수치 오차 허용표는 아닙니다.
- 1.25km→UI1.3km,214.5W NP 같은 저장/표시 반올림을 명시했습니다. 표의 TSS 소수 축약은 읽기용이며 정밀값은 JSON에 남아 있습니다. `599.9999999999999` 등 부동소수 관측을 임의 실패/정확600 재작성으로 바꾸지 않았습니다.
- **거리·고도·파워·NP·TSS·심박·존의 유료 Strava 대조 허용 오차는 미정/미확인**입니다. 이 실행들은 유료 Strava 동일 원본 비교를 하지 않았습니다. 별도 제조사/기기 측정 정확도 오차표도 없습니다.
- LTHR 변화가 HR 존 경계를 실제로 넘는 fixture, 가상 파워 추정 경로, 앱 실기기 GPS/센서 pause-resume, Android/iOS의 동일 입력 화면, 운영 전체 원천 커버리지, 자동 scheduler delivery는 이 묶음만으로 충족되지 않습니다.

## 원본 파일 SHA256

경로는 모두 E 기준입니다. `mixed.zip!name`은 실제 ZIP member를 압축 해제한 바이트의 해시입니다. 자격증명·계정 파일은 읽지 않았으며 표에 포함하지 않습니다.

| 원본 | 바이트 | SHA256 |
|---|---:|---|
| `import-formats/direct-synthetic.gpx` | 61540 | `c4e8c0795a82c1813b921043f05ac585f2574f27b7c7a7a1e186c1d339589416` |
| `import-formats/mixed.zip` | 285041 | `aa94fb0562e52c36148f138bdd052f8b9fa4c29de36e501f0f5102411c131afc` |
| `import-formats/mixed.zip!gps.gpx` | 61540 | `c4e8c0795a82c1813b921043f05ac585f2574f27b7c7a7a1e186c1d339589416` |
| `import-formats/mixed.zip!sensor.tcx` | 223047 | `fd086e3acfd4d2d023ea25d6b9ad999265a70135d0890dfaf473441ad7e01443` |
| `import-formats/mixed.zip!ignored.txt` | 31 | `131b2b079adc076ab8af5aedacc2212790e8ebca16213df1a62b61a1b34d351e` |
| `import-formats/mixed.zip!broken.fit` | 21 | `1ae4f3bcc166a0a0b8d20a336f879c8d1dba5c7d57ba98f82051b512b7770221` |
| `import-formats/sensor.fit` | 12847 | `27e5aa7bf9f480f02d128442037f3e66ef2472b1aaeef8f61be73dc7fdf7cbbe` |
| `import-formats/sensor.tcx` | 223047 | `450defb034398df363223867b81a993c5b84e88660d15c1305a2ecd5373cb217` |
| `import-formats/zip-sensor.tcx` | 223047 | `fd086e3acfd4d2d023ea25d6b9ad999265a70135d0890dfaf473441ad7e01443` |
| `import-kst/direct-synthetic.gpx` | 61530 | `21a3c2e11593e8bbb6ef6c88ba9a568716a4e80b378f2385ae80a5da5a1e89be` |
| `import-unset-timezone/direct-synthetic.gpx` | 61524 | `73d72f343899b4ad186b8cf4fec5e2c37894af20d7c282c8889f0e3e065cbb6c` |
| `r42-source-matrix/indoor-sensor.gpx` | 149398 | `ba799b307d6eba4adb10fbef3baad0cd442d8291aa4a1e4772feb7a5f86dfb64` |
| `r42-source-matrix/zero-stop.gpx` | 82677 | `398e91b846cf88022440e5d7629ea7effa8d1243ed7404400a596320c030c380` |
| `r42-clock-basis/zero-stop.gpx` | 82677 | `b789884ba3373b1a9b62a8da8767e6ba254b3df48b4ac12b38d16689122fc1d1` |
| `route-import-v2/forward600.gpx` | 62726 | `9db8999a3aeac2728b99dfbcaa7eabde36a39c9aee681eccd2d551fc2ab194e5` |
| `route-import-v2/forward720.gpx` | 62726 | `f29be3a87c36faf5113db0fa223f06a4a9f3052a60ac52c0ca759223c0eefcef` |
| `route-import-v2/partial300.gpx` | 62726 | `a8482af0a302b03ef6dcb5760ad3170c4dd389d7287d94a52729e7b94a2bb431` |
| `route-import-v2/reverse600.gpx` | 62726 | `75a3a74386424f937537a13f2eda2b02983f9f45bdc172b12d8a4f60cc9e21b8` |

## 재현·정리 경계

원본과 결과는 검토용으로 보존했습니다. `import-formats/readback-cleanup.cjs`, KST/미설정 계정의 `direct-cleanup.cjs` 및 각 `resource-manifest.json`/`fixture.json`은 정확한 격리 리소스를 식별하는 자료입니다. 이 문서를 위해 cleanup, upload, recompute, UI 측정, quota reset은 실행하지 않았습니다. 실제 재실행 시 각 artifact/owner/allowlist를 다시 확인해야 하며 기존 결과를 새 artifact의 성공 근거로 덮어쓰지 않습니다.

`import-kst/README.md`와 `import-unset-timezone/PLAN.md`의 앞부분 준비/대기 문구는 아래 완료 절과 JSON으로 후속된 과거 기록입니다. 최신 결과를 읽을 때 준비 상태와 혼동하지 않습니다. 서비스 계약·활성 runtime 최신 상태는 [acceptance-followup.md](acceptance-followup.md) 및 외부 REVIEW를 함께 확인합니다.
