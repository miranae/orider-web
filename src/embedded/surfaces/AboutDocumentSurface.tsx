import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { useEmbeddedNavigation } from "../EmbeddedNavigationContext";
import type { HubSurfaceProps } from "./HubSurfaceFrame";
import { logClientError } from "../../services/errorLogger";

const stylesheets = new Set(["/about/campaign.css", "/about/intro.css", "/web-manual/style.css"]);
/** 소개 정본을 재사용하되 스타일은 Shadow DOM으로 격리하고 iframe 허용 정책은 넓히지 않는다. */
export default function AboutDocumentSurface(props: Pick<HubSurfaceProps, "onReady" | "onError">) {
  const { lang } = useParams();
  const [path, setPath] = useState(`/${lang === "en" ? "en" : "ko"}/about/index.html`);
  const host = useRef<HTMLDivElement>(null);
  const navigate = useEmbeddedNavigation();
  const callbacks = useRef({ ...props, navigate }); callbacks.current = { ...props, navigate };
  useEffect(() => { setPath(`/${lang === "en" ? "en" : "ko"}/about/index.html`); }, [lang]);
  useEffect(() => {
    const root = host.current?.shadowRoot ?? host.current?.attachShadow({ mode: "open" });
    if (!root) return;
    let cancelled = false;
    root.replaceChildren();
    const read = async (url: string) => {
      const response = await fetch(url, { credentials: "omit", redirect: "error" });
      if (!response.ok) throw new Error("about_document_unavailable");
      return response.text();
    };
    const click = (event: Event) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.origin);
      if (!["https:", "http:"].includes(url.protocol)) return;
      event.preventDefault();
      const about = /^\/(ko|en)\/about\/(index|app|web|roadmap)\.html$/.exec(url.pathname);
      if (url.origin === window.location.origin && about) {
        if (url.pathname === path && url.hash) root.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
        else setPath(url.pathname);
      } else callbacks.current.navigate?.(url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : url.href);
    };
    root.addEventListener("click", click);
    void (async () => {
      const parsed = new DOMParser().parseFromString(await read(path), "text/html");
      const cssPaths = [...parsed.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(link => new URL(link.getAttribute("href")!, window.location.origin).pathname);
      if (!parsed.querySelector("h1") || !cssPaths.length || cssPaths.some(css => !stylesheets.has(css))) throw new Error("about_document_invalid");
      const css = await Promise.all(cssPaths.map(read));
      const source = parsed.body;
      source.querySelectorAll("nav,footer,script").forEach(node => node.remove());
      for (const node of source.querySelectorAll<HTMLElement>("[href],[src]")) {
        for (const attr of ["href", "src"]) {
          const value = node.getAttribute(attr);
          if (value) node.setAttribute(attr, new URL(value, new URL(path, window.location.origin)).href);
        }
      }
      if (cancelled) return;
      const body = document.createElement("body"), style = document.createElement("style");
      body.className = parsed.body.className;
      body.innerHTML = DOMPurify.sanitize(source.outerHTML, { FORBID_TAGS: ["script", "iframe", "form"] });
      style.textContent = css.join("\n");
      root.append(style, body);
      callbacks.current.onReady();
    })().catch(error => {
      if (cancelled) return;
      logClientError("embedded.aboutDocument", error);
      callbacks.current.onError("surface_load_failed");
    });
    return () => { cancelled = true; root.removeEventListener("click", click); root.replaceChildren(); };
  }, [path]);
  return <div ref={host} data-testid="embedded-about-document" />;
}
