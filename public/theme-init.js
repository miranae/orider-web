// Apply the saved theme before React mounts to avoid a light/dark flash.
(function () {
  try {
    var theme = localStorage.getItem("orider.theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {}
})();
