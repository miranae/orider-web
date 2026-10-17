import { useEffect, useRef, useState } from "react";
import { Clipboard, Download, MessageSquareText } from "lucide-react";
import { LocalizedLink } from "../LocalizedLink";
import { Button, buttonClass } from "../../theme/components";

export interface RecipePublicCard {
  title: string;
  body: string;
  footer: string;
  kind?: "story" | "badge" | "load" | "diary" | "alert" | "log";
  kicker?: string;
  metrics?: { label: string; value: string }[];
  imageDataUrl?: string;
  imageAlt?: string;
}


function wrapCardText(text: string, width: number): string[] {
  const units = (value: string) => Array.from(value).reduce((sum, char) => sum + (/[\u0020-\u007e]/.test(char) ? 0.56 : 1), 0);
  return text.split("\n").flatMap((paragraph) => {
    if (!paragraph) return [""];
    const lines: string[] = [];
    let line = "";
    for (const token of paragraph.match(/\S+\s*|\s+/g) ?? []) {
      if (units(token.trimEnd()) <= width) {
        if (line && units(line + token.trimEnd()) > width) { lines.push(line.trimEnd()); line = ""; }
        line += line ? token : token.trimStart();
      } else {
        for (const char of Array.from(token)) {
          if (line && units(line + char) > width) { lines.push(line.trimEnd()); line = ""; }
          line += char;
        }
      }
    }
    if (line) lines.push(line.trimEnd());
    return lines;
  });
}

/** This component accepts only public fields; private diary text never enters an export. */
export function RecipeShareCard({ card, language, ready, onError }: {
  card: RecipePublicCard; language: string; ready: boolean; onError: (action: "copy" | "export") => void;
}) {
  const ko = language.startsWith("ko");
  const [draft, setDraft] = useState(card);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(card); setCopied(false); setEditing(false); }, [card, language]);
  const hasPhoto = Boolean(draft.imageDataUrl && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(draft.imageDataUrl));
  const artworkOffset = hasPhoto ? 380 : 0;
  const artworkHeight = 900 + artworkOffset;
  const editedFooter = ko ? "라이더가 편집한 문구 · 공유 전 확인" : "Edited by rider · review before sharing";
  const preview = useRef<SVGSVGElement>(null);
  const title = draft.title.trim();
  const body = draft.body.trim();
  const lines = wrapCardText(body, 23);
  const titleLines = wrapCardText(title, 15);
  const contentFits = lines.length <= 7 && titleLines.length <= 2;
  const metricText = draft.metrics?.map((metric) => `${metric.label}: ${metric.value}`).join(" · ");
  const text = `${title}\n\n${metricText ? `${metricText}\n\n` : ""}${body}\n\n${draft.footer}\nORIDER · orider.co.kr`;
  const valid = ready && Boolean(title && body) && contentFits;
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch { onError("copy"); }
  };
  const download = async () => {
    if (!preview.current) return;
    setSaving(true);
    let url: string | undefined;
    try {
      const svg = preview.current.cloneNode(true) as SVGSVGElement;
      svg.setAttribute("width", "720");
      svg.setAttribute("height", String(artworkHeight));
      const styles = getComputedStyle(preview.current);
      for (const element of [svg, ...svg.querySelectorAll("*")]) {
        for (const attribute of ["fill", "stroke"]) {
          const value = element.getAttribute(attribute);
          const token = value?.match(/^var\((--[^)]+)\)$/)?.[1];
          if (token) element.setAttribute(attribute, styles.getPropertyValue(token).trim());
        }
      }
      url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url!; });
      const canvas = document.createElement("canvas");
      canvas.width = 1080; canvas.height = hasPhoto ? 1920 : 1350;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Export failed")), "image/png"));
      const link = document.createElement("a");
      const fileUrl = URL.createObjectURL(blob);
      link.href = fileUrl; link.download = "orider-ride-highlight.png"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    } catch { onError("export"); }
    finally { if (url) URL.revokeObjectURL(url); setSaving(false); }
  };
  // SVG text is escaped by React. Fixed line limits also keep PNG and live preview identical.
  const metrics = draft.metrics?.slice(0, 3) ?? [];
  const primary = metrics[0];
  const bodyStart = primary ? 565 : 407;
  const bodyLineHeight = Math.min(primary ? 28 : 38, (740 - bodyStart) / Math.max(lines.length, 1));
  const bodyFontSize = Math.min(primary ? 23 : 29, bodyLineHeight * 0.85);
  const titleFontSize = Math.min(37, 85 / Math.max(titleLines.length, 1));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2 text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>
      <span>{ready ? (ko ? "공유용 하이라이트 · 원문 일기 제외" : "Public highlight · private diary excluded") : (ko ? "디자인 예시 · 내 활동이 아닙니다" : "Design example · not your activity")}</span>
      {ready && <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>{ko ? "문구 편집" : "Edit copy"}</Button>}
    </div>
    <svg ref={preview} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 720 ${artworkHeight}`} role="img" aria-label={title} className="mx-auto w-full max-w-md rounded-[var(--r-lg)]" fontFamily="sans-serif">
      <title>{title}</title><desc>{body}</desc>
      <rect width="720" height={artworkHeight} fill="var(--bg-1)" />
      <rect x="42" y="42" width="636" height={artworkHeight - 84} rx="8" fill="var(--bg-2)" stroke="var(--line)" />
      {hasPhoto && <image href={draft.imageDataUrl} x="42" y="146" width="636" height="350" preserveAspectRatio="xMidYMid slice" aria-label={draft.imageAlt ?? (ko ? "선택한 라이딩 사진" : "Selected ride photo")} />}
      <path d={`M80 146h560M80 ${748 + artworkOffset}h560`} stroke="var(--line)" />
      <text x="80" y="110" fill="var(--lime)" fontSize="25" fontWeight="800" letterSpacing="6">ORIDER</text>
      <text x="640" y="108" textAnchor="end" fill="var(--ink-3)" fontSize="13" letterSpacing="2">RIDE / REFLECT / REPEAT</text>
      <text x="80" y={190 + artworkOffset} fill="var(--ink-3)" fontSize="14" letterSpacing="3">{ready ? (draft.kicker ?? "MY RIDE HIGHLIGHT") : "DESIGN PREVIEW"}</text>
      {titleLines.slice(0, 2).map((line, index) => <text key={index} x="80" y={250 + artworkOffset + index * (titleFontSize + 8)} fill="var(--ink-0)" fontSize={titleFontSize} fontWeight="700">{line}</text>)}
      <rect x="80" y={(primary ? 325 : 355) + artworkOffset} width="48" height="5" rx="2" fill="var(--lime)" />
      {primary && <g>
        <text x="80" y={350 + artworkOffset} fill="var(--ink-3)" fontSize="16" letterSpacing="2">{primary.label}</text>
        <text x="76" y={438 + artworkOffset} fill="var(--ink-0)" fontSize={Math.min(88, 870 / Math.max(Array.from(primary.value).length, 1))} fontWeight="750" letterSpacing="-3">{primary.value}</text>
        {metrics.slice(1).map((metric, index) => <g key={metric.label}>
          <text x={80 + index * 290} y={480 + artworkOffset} fill="var(--ink-3)" fontSize="14" letterSpacing="1">{metric.label}</text>
          <text x={80 + index * 290} y={516 + artworkOffset} fill="var(--lime)" fontSize={Math.max(21, Math.min(30, 240 / Math.max(Array.from(metric.value).length, 1)))} textLength={Array.from(metric.value).length > 12 ? 260 : undefined} lengthAdjust="spacingAndGlyphs" fontWeight="650">{metric.value}</text>
        </g>)}
      </g>}
      {lines.slice(0, 7).map((line, index) => <text key={index} x="80" y={bodyStart + artworkOffset + index * bodyLineHeight} fill="var(--ink-2)" fontSize={bodyFontSize}>{line}</text>)}
      <text x="80" y={792 + artworkOffset} fill="var(--ink-3)" fontSize={Math.min(15, 540 / Math.max(Array.from(draft.footer).length, 1))}>{draft.footer}</text>
      <text x="80" y={825 + artworkOffset} fill="var(--ink-3)" fontSize="14" letterSpacing="2">orider.co.kr</text>
    </svg>
    {editing && <div className="grid gap-3">
      <label className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>{ko ? "제목 (30자)" : "Title (30 characters)"}<input className="mt-1 w-full rounded-[var(--r-sm)] border p-2" style={{ background: "var(--bg-2)", borderColor: "var(--line)" }} maxLength={30} value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value, footer: editedFooter }); setCopied(false); }} /></label>
      <label className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-2)" }}>{ko ? "공개 문구 (160자)" : "Public copy (160 characters)"}<textarea className="mt-1 w-full rounded-[var(--r-sm)] border p-2" style={{ background: "var(--bg-2)", borderColor: "var(--line)" }} maxLength={160} rows={5} value={draft.body} onChange={(event) => { setDraft({ ...draft, body: event.target.value, footer: editedFooter }); setCopied(false); }} /></label>
      <p className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-3)" }}>{ko ? "추가한 문구에 위치·활동명·민감한 정보가 없는지 확인하세요." : "Check that your edits contain no locations, activity names, or sensitive information."}</p>
    </div>}
    {!contentFits && <p role="alert" className="text-[length:var(--fs-sm)]" style={{ color: "var(--rose)" }}>{ko ? "카드에 읽기 좋게 담기도록 제목은 2줄, 본문은 7줄 이내로 줄여 주세요." : "Keep the title within 2 lines and the caption within 7 lines for a readable card."}</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" disabled={!valid} onClick={() => void copy()}><Clipboard size={15} />{copied ? (ko ? "복사 완료" : "Copied") : (ko ? "공유 문구 복사" : "Copy caption")}</Button>
      <Button size="sm" variant="secondary" disabled={!valid} loading={saving} onClick={() => void download()}><Download size={15} />{ko ? "PNG 저장" : "Save PNG"}</Button>
      {valid && <LocalizedLink data-testid="E6-2-1" to="/community/board/write" state={{ postTemplate: { title, body: text } }} className={buttonClass({ variant: "primary", size: "sm" })}><MessageSquareText size={15} />{ko ? "게시글로 공유" : "Share as post"}</LocalizedLink>}
    </div>
  </div>;
}
