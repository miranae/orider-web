/** Preserve the selected sport through coach actions, including URL fragments. */
export function coachRoute(path: string, sport: "bike" | "run" | "swim") {
  const [base = "", hash] = path.split("#", 2);
  const [pathname = "", search] = base.split("?", 2);
  const params = new URLSearchParams(search);
  params.set("sport", sport);
  return `${pathname}?${params}${hash ? `#${hash}` : ""}`;
}
