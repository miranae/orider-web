import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

// 동적 import 청크 로드 실패 자동 복구.
//
// 배포가 새로 올라가면 기존 탭에 로드된 옛 index.html 이 참조하는 청크 해시
// (예: AthletePage-D7d6Ypv4.js) 가 서버에서 사라진다. 이때 lazy() 의 import() 가
// "Failed to fetch dynamically imported module" 로 실패하며 에러 바운더리로 떨어진다.
//
// 해결: 청크 로드 에러를 감지하면 페이지를 1회 새로고침해 새 HTML(=새 청크 해시)을
// 받게 한다. 무한 새로고침을 막기 위해 sessionStorage 타임스탬프 가드를 둔다 —
// 새로고침 직후에도 같은 청크가 또 실패하면(진짜 깨진 배포) 가드 윈도우 안이므로
// 에러를 그대로 던져 에러 바운더리가 보이게 한다.

const RELOAD_KEY = "orider:chunk-reload-ts";
const RELOAD_WINDOW_MS = 10_000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|dynamically imported module/i.test(
    msg,
  );
}

// 최근 RELOAD_WINDOW_MS 안에 이미 새로고침을 시도했는지. 아니면 타임스탬프를
// 찍고 true 를 반환(=새로고침 진행해도 됨).
function shouldReloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    // sessionStorage 접근 불가(시크릿 모드 등) — 가드 없이 1회 새로고침은 허용
    return true;
  }
}

// React 의 lazy 와 동일하게 ComponentType<any> 로 제약 — prop 타입 보존을 위해.
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (isChunkLoadError(err) && shouldReloadOnce()) {
        window.location.reload();
        // 새로고침이 진행되는 동안 영원히 pending — 에러 바운더리 깜빡임 방지
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
