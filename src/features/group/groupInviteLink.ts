export function normalizeGroupInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function buildGroupInvitePath(code: string, language: string): string {
  const lang = language.startsWith("en") ? "en" : "ko";
  return `/${lang}/group/join/${encodeURIComponent(normalizeGroupInviteCode(code))}`;
}

export function buildGroupInviteUrl(code: string, language: string, origin = window.location.origin): string {
  return `${origin}${buildGroupInvitePath(code, language)}`;
}
