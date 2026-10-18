/** OAuth 처리 화면으로 복귀하면 같은 컴포넌트가 남으므로 안전한 홈으로 이동한다. */
export function socialAuthReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://orider.invalid");
    if (url.origin !== "https://orider.invalid") return "/";
    const path = decodeURIComponent(url.pathname).replace(/^\/(ko|en)(?=\/|$)/, "");
    return /^\/auth\/social\/callback\/*$/.test(path) ? "/" : value;
  } catch {
    return "/";
  }
}
