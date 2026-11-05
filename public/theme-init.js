// React가 마운트되기 전에도 시스템/사용자 테마와 기본 폼 색을 맞춘다.
(function () {
  var theme;
  try { theme = localStorage.getItem("orider.theme"); } catch (e) {}
  var resolved = theme === "light" || theme === "dark" ? theme
    : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
})();
