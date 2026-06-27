/**
 * Core Web Vitals 측정 → Firebase Analytics 전송.
 *
 * 측정 대상 (web-vitals 라이브러리 자동 수집):
 *  - LCP (Largest Contentful Paint) — 메인 콘텐츠 렌더 완료. < 2.5s 양호.
 *  - INP (Interaction to Next Paint) — 사용자 입력 응답성. < 200ms 양호. FID 후속.
 *  - CLS (Cumulative Layout Shift) — 누적 레이아웃 이동. < 0.1 양호.
 *  - FCP (First Contentful Paint) — 첫 텍스트/이미지 렌더. < 1.8s 양호.
 *  - TTFB (Time to First Byte) — 서버 응답. < 800ms 양호.
 *
 * 각 메트릭은 `web_vitals` 이벤트로 발사 — name(메트릭명), value(원본 ms/score),
 * rating(good/needs-improvement/poor), delta(이전 보고 대비 변화량), id(metric instance).
 * BigQuery 에서 metric 별 p50/p75/p90 집계 + rating 분포 분석 가능.
 *
 * 주의: web-vitals 는 사용자가 페이지를 떠나거나 hidden 상태일 때 최종 값 보고. 따라서
 * 페이지 한 번 방문당 메트릭 1회 (또는 INP 처럼 변동 보고 시 여러 번) 발사.
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import { track } from "./analytics";
import { reportSlowPage } from "./slowRequests";

/** CLS 만 0~1 score → 소수점 3자리. 나머지는 PerformanceObserver 가 이미 정수 ms 반환. */
function formatValue(metric: Metric): number {
  return metric.name === "CLS"
    ? Math.round(metric.value * 1000) / 1000
    : Math.round(metric.value);
}

function formatDelta(metric: Metric): number {
  return metric.name === "CLS"
    ? Math.round(metric.delta * 1000) / 1000
    : Math.round(metric.delta);
}

/**
 * web-vitals 는 페이지 lifecycle (`pagehide`/`visibilitychange`) 시점에 메트릭 보고.
 * SPA 에서 INP/CLS 처럼 늦게 발사되는 메트릭은 측정 시점의 `window.location.pathname`
 * 을 직접 읽어 라이브 경로를 기록 — 이전의 initialPath snapshot 방식은 라우팅 이후
 * path mismatch 가 있었음(코드 주석 참조).
 * LCP/FCP/TTFB 는 첫 로드 메트릭이라 어느 방식이든 동일하게 정확.
 */
function makeReporter() {
  return (metric: Metric): void => {
    const pagePath = window.location.pathname;
    track("web_vitals", {
      metric_name: metric.name,
      value: formatValue(metric),
      rating: metric.rating,
      delta: formatDelta(metric),
      metric_id: metric.id,
      navigation_type: metric.navigationType,
      page_path: pagePath,
    });
    // poor 등급은 별도 slow_page 이벤트로 한 번 더 발사 — 네트워크/디바이스 컨텍스트 포함.
    // 재현 어려운 슬로우다운의 환경 단서 보전 목적.
    if (metric.rating === "poor") {
      reportSlowPage(metric.name, metric.value, pagePath);
    }
  };
}

/**
 * App 마운트 후 1회 호출. 각 메트릭은 발생 시 자동으로 reporter 콜.
 * 라이브러리가 페이지 lifecycle 을 감지해 적절 시점에 보고.
 */
export function reportWebVitals(): void {
  const report = makeReporter();
  onCLS(report);
  onFCP(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
}
