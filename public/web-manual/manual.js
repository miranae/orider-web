// Orider 웹 매뉴얼 — 사이드바 토글 + 클라이언트 검색
(function () {
  // ── 모바일 사이드바 토글 ───────────────────────────────
  var sidebar = document.getElementById("sidebar");
  var menuBtn = document.getElementById("menuBtn");
  var backdrop = document.getElementById("backdrop");
  function close() { sidebar && sidebar.classList.remove("open"); backdrop && backdrop.classList.remove("show"); }
  if (menuBtn) menuBtn.addEventListener("click", function () {
    sidebar.classList.toggle("open");
    backdrop.classList.toggle("show");
  });
  if (backdrop) backdrop.addEventListener("click", close);

  // ── 검색 ───────────────────────────────────────────────
  var input = document.getElementById("q");
  var box = document.getElementById("results");
  if (!input || !box) return;
  var index = [];
  fetch("search-index.json").then(function (r) { return r.json(); }).then(function (d) { index = d; }).catch(function () {});

  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) { box.classList.remove("show"); box.innerHTML = ""; return; }
    var hits = [];
    for (var i = 0; i < index.length; i++) {
      var p = index[i];
      var hay = (p.title + " " + p.group + " " + (p.headings || []).join(" ") + " " + (p.text || "")).toLowerCase();
      if (hay.indexOf(q) !== -1) {
        // 일치한 소제목 찾기
        var sub = (p.headings || []).filter(function (h) { return h.toLowerCase().indexOf(q) !== -1; })[0];
        hits.push({ url: p.url, title: p.title, group: p.group, sub: sub });
      }
      if (hits.length >= 20) break;
    }
    if (!hits.length) { box.innerHTML = '<div class="r-empty">검색 결과 없음</div>'; box.classList.add("show"); return; }
    box.innerHTML = hits.map(function (h) {
      return '<a href="' + h.url + '"><span class="r-grp">' + esc(h.group) + '</span><br>' +
        esc(h.title) + (h.sub ? ' <span class="r-grp">· ' + esc(h.sub) + "</span>" : "") + "</a>";
    }).join("");
    box.classList.add("show");
  }

  input.addEventListener("input", function () { search(input.value); });
  input.addEventListener("focus", function () { if (input.value) search(input.value); });
  document.addEventListener("click", function (e) {
    if (!box.contains(e.target) && e.target !== input) box.classList.remove("show");
  });
  // 키보드: ↓↑ Enter
  input.addEventListener("keydown", function (e) {
    var items = Array.prototype.slice.call(box.querySelectorAll("a"));
    if (!items.length) return;
    var cur = box.querySelector("a.sel");
    var idx = items.indexOf(cur);
    if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); }
    else if (e.key === "Enter") { if (cur) location.href = cur.getAttribute("href"); return; }
    else return;
    items.forEach(function (a) { a.classList.remove("sel"); });
    if (items[idx]) items[idx].classList.add("sel");
  });
})();
