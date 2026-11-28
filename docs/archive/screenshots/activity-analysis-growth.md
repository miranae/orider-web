# Activity analysis and growth screenshots

These screenshots render the shared activity detail chart and growth components with synthetic running observations and synthetic history/metrics responses. They use the application's production theme styles, Pretendard/JetBrains Mono fonts, Korean locale (`ko-KR`), and actual Chart.js canvases. The shared components are integrated into the web activity page and the embedded activity-analysis surface; this fixture is not a production account, native-device capture, or proof of backend data availability.

| Viewport | Screenshot |
| --- | --- |
| 320 × 900 | [320 px](activity-analysis-growth-320.png) |
| 390 × 900 | [390 px](activity-analysis-growth-390.png) |
| 1440 × 900 | [1440 px](activity-analysis-growth-1440.png) |

The fixture opens detailed charts, comparison, statistics, and source activities; it selects a prior same-sport activity. Playwright checks `document.documentElement.scrollWidth <= window.innerWidth` and captures page errors. All three widths have zero horizontal overflow and zero page errors. Each renders three canvases: elevation, pace, and heart rate. Pace units remain visible in the legend while clock-only axis ticks preserve the chart width.

Source activity anchors are checked for `/activity/{id}` hrefs and clicked against an intercepted synthetic destination; all three widths navigate to the expected activity route. This verifies the link target and browser navigation. The embedded native-navigation bridge is covered by its existing navigation contract and was not exercised on a physical phone in this fixture.

Local evidence: `/tmp/activity-chart-growth-visual.log` and `/tmp/orider-activity-detail-charts/`. The temporary visual harness lives under ignored `.omc/visual/` and is not part of the product build.
