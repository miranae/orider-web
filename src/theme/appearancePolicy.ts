/** 오래 켜두는 실시간 관전 표면은 시스템/저장 선호와 무관하게 절전 다크를 유지한다. */
export function usesLiveDarkAppearance(pathname: string): boolean {
  return /^\/(?:ko|en)\/live\/[^/]+\/?$/.test(pathname)
    || /^\/(?:ko|en)\/(?:embed\/clubs|club)\/[^/]+\/meetings\/[^/]+\/live\/?$/.test(pathname);
}
