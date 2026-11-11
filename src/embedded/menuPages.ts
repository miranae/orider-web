export type EmbeddedMenuPage = "about" | "community-guidelines" | "feedback" | "activity-edit";
export const APP_MENU_EMBED_CAPABILITY = "app-menu-embed-v1";
export function isMenuPage(kind: string): kind is EmbeddedMenuPage {
  return ["about", "community-guidelines", "feedback", "activity-edit"].includes(kind);
}
export function isPublicMenuPage(kind: string): boolean {
  return kind === "about" || kind === "community-guidelines";
}
