import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import DOMPurify from 'dompurify';
import { useCreatePost } from '../features/board/useBoard';

import { useAuth } from '../contexts/AuthContext';
import { storage } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button, Card } from "../theme/components";
const MAX_IMAGES = 5;

/** Try to download an external image as a File (same-origin or CORS-enabled only). */
async function fetchImageAsFile(src: string): Promise<File | null> {
  const ts = Date.now();

  // data: URIs — always works
  if (src.startsWith('data:')) {
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      return new File([blob], `pasted-${ts}.png`, { type: blob.type || 'image/png' });
    } catch { return null; }
  }

  // Try direct fetch (same-origin or CORS-enabled servers)
  try {
    const resp = await fetch(src);
    const blob = await resp.blob();
    if (blob.size > 0 && blob.type.startsWith('image/')) {
      return new File([blob], `pasted-${ts}.${blob.type.split('/')[1] || 'png'}`, { type: blob.type });
    }
  } catch { /* CORS blocked */ }

  // Do NOT try canvas with crossOrigin='anonymous' — it sends an Origin header
  // which causes servers like Naver to return 403, polluting the browser cache
  // and breaking normal <img> display. Just return null and keep the external URL.
  return null;
}

/** 커서 위치에서 위로 올라가며 특정 블록 태그 탐지 */
function findParentBlock(editor: HTMLElement): { blockType: string; listType: string } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { blockType: '', listType: '' };

  let node: Node | null = sel.anchorNode;
  let blockType = '';
  let listType = '';

  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as HTMLElement).tagName.toLowerCase();
      if (tag === 'h2' && !blockType) blockType = 'h2';
      else if (tag === 'h3' && !blockType) blockType = 'h3';
      else if (tag === 'blockquote' && !blockType) blockType = 'blockquote';
      else if (tag === 'pre' && !blockType) blockType = 'pre';
      else if (tag === 'ul' && !listType) listType = 'ul';
      else if (tag === 'ol' && !listType) listType = 'ol';
    }
    node = node.parentNode;
  }
  return { blockType, listType };
}

const CreatePostPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("board");
  const { user } = useAuth();
  const { createPost, submitting } = useCreatePost();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const tablePickerRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [imageCount, setImageCount] = useState(0);
  const [editorEmpty, setEditorEmpty] = useState(true);

  const [searchParams] = useSearchParams();
  const isInquiry = searchParams.get('type') === 'inquiry';
  const isDevlog = searchParams.get('type') === 'devlog';
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'question' | 'other'>('bug');
  const [isPrivate, setIsPrivate] = useState(false);

  // 서식 상태
  const [formatState, setFormatState] = useState({
    bold: false, italic: false, underline: false, strikeThrough: false,
    blockType: '', // 'h2'|'h3'|'blockquote'|'pre'|''
    listType: '',  // 'ul'|'ol'|''
  });

  // 표 피커
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tableHover, setTableHover] = useState({ rows: 0, cols: 0 });

  const imageMapRef = useRef<Map<string, File>>(new Map());

  const checkEditorEmpty = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const hasText = (editor.textContent || '').trim().length > 0;
    const hasImages = editor.querySelectorAll('img').length > 0;
    setEditorEmpty(!hasText && !hasImages);
  };

  // 서식 상태 감지
  const updateFormatState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) return;

    const { blockType, listType } = findParentBlock(editor);

    setFormatState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      blockType,
      listType,
    });
  }, []);

  // selectionchange 리스너
  useEffect(() => {
    const handler = () => updateFormatState();
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [updateFormatState]);

  // 표 피커 외부 클릭 닫기
  useEffect(() => {
    if (!showTablePicker) return;
    const handler = (e: MouseEvent) => {
      if (tablePickerRef.current && !tablePickerRef.current.contains(e.target as Node)) {
        setShowTablePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTablePicker]);

  /** 블록 서식 토글 (H2, H3, BLOCKQUOTE) */
  const toggleBlock = (tag: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (formatState.blockType === tag.toLowerCase()) {
      document.execCommand('formatBlock', false, 'DIV');
    } else {
      document.execCommand('formatBlock', false, tag);
    }
    setTimeout(updateFormatState, 0);
  };

  /** 코드 블록 삽입/해제 */
  const insertCodeBlock = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    // 이미 pre 안이면 해제
    if (formatState.blockType === 'pre') {
      document.execCommand('formatBlock', false, 'DIV');
      setTimeout(updateFormatState, 0);
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = range.toString() || t('placeholder.codeBlock');
    pre.appendChild(code);

    // 탈출용 빈 줄
    const after = document.createElement('div');
    after.innerHTML = '<br>';

    range.deleteContents();
    range.insertNode(after);
    range.insertNode(pre);

    // 커서를 코드 안으로
    const newRange = document.createRange();
    newRange.selectNodeContents(code);
    if (range.toString()) newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setTimeout(updateFormatState, 0);
  };

  /** NxM 표 삽입 */
  const insertTable = (rows: number, cols: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    setShowTablePicker(false);

    const table = document.createElement('table');

    // 헤더
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      th.textContent = `${t('placeholder.tableHeader')}${c + 1}`;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 본문
    const tbody = document.createElement('tbody');
    for (let r = 0; r < rows - 1; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // 탈출용 빈 줄
    const after = document.createElement('div');
    after.innerHTML = '<br>';

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(after);
      range.insertNode(table);
    } else {
      editor.appendChild(table);
      editor.appendChild(after);
    }

    // 커서를 첫 번째 셀로
    const firstCell = table.querySelector('th');
    if (firstCell) {
      const range = document.createRange();
      range.selectNodeContents(firstCell);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    checkEditorEmpty();
  };

  const insertImageAtCursor = useCallback((file: File) => {
    if (imageMapRef.current.size >= MAX_IMAGES) {
      alert(t('message.imageLimitWarning', { max: MAX_IMAGES }));
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    imageMapRef.current.set(blobUrl, file);
    setImageCount(imageMapRef.current.size);

    const editor = editorRef.current;
    if (!editor) return;

    const img = document.createElement('img');
    img.src = blobUrl;
    img.setAttribute('data-blob', 'true');

    const wrapper = document.createElement('div');
    wrapper.appendChild(img);

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(wrapper);
      const after = document.createElement('div');
      after.innerHTML = '<br>';
      wrapper.after(after);
      range.setStartAfter(after);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editor.appendChild(wrapper);
      const after = document.createElement('div');
      after.innerHTML = '<br>';
      editor.appendChild(after);
    }

    editor.focus();
    setEditorEmpty(false);
  }, []);

  // Find untracked <img> in editor, download & convert to tracked blobs
  const processNewImages = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const untrackedImgs = Array.from(editor.querySelectorAll<HTMLImageElement>('img:not([data-blob]):not([data-external])'));
    for (const img of untrackedImgs) {
      if (imageMapRef.current.size >= MAX_IMAGES) break;

      // Handle lazy-loading patterns (data-src, data-original, etc.)
      const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
      if (!src || src.startsWith('data:image/gif;base64,R0lGOD')) { img.remove(); continue; } // remove 1px placeholder gifs

      const file = await fetchImageAsFile(src);
      if (file) {
        const blobUrl = URL.createObjectURL(file);
        imageMapRef.current.set(blobUrl, file);
        img.src = blobUrl;
        img.setAttribute('data-blob', 'true');
      } else {
        // CORS blocked — keep external URL visible with no-referrer for display
        img.setAttribute('data-external', 'true');
        img.setAttribute('referrerpolicy', 'no-referrer');
      }
    }
    setImageCount(imageMapRef.current.size);
    checkEditorEmpty();
  }, []);

  // Manually parse clipboard HTML, sanitize, insert with images preserved
  const insertSanitizedHtml = useCallback(async (html: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    // DOMPurify로 먼저 sanitize 후 DOM 파싱 (XSS 방지)
    const temp = document.createElement('div');
    temp.innerHTML = DOMPurify.sanitize(html);

    // Remove scripts, styles, meta junk
    temp.querySelectorAll('script, style, link, meta, noscript, iframe').forEach(el => el.remove());

    // Strip style/class/id from all elements (keep structure clean)
    temp.querySelectorAll('*').forEach(el => {
      el.removeAttribute('style');
      el.removeAttribute('class');
      el.removeAttribute('id');
    });

    // Fix lazy-loaded images + enable cross-origin display
    temp.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src');
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
      // no-referrer bypasses Referer-based hotlink protection (Naver, etc.)
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.removeAttribute('data-src');
      img.removeAttribute('data-original');
      img.removeAttribute('loading');
      img.removeAttribute('width');
      img.removeAttribute('height');
    });

    // Insert sanitized HTML at cursor (execCommand preserves cursor position)
    editor.focus();
    document.execCommand('insertHTML', false, DOMPurify.sanitize(temp.innerHTML));
    checkEditorEmpty();

    // Then async: download external images → tracked blobs
    await processNewImages();
  }, [processNewImages]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(i => i.type.startsWith('image/'));
    const html = e.clipboardData.getData('text/html');

    // Case 1: HTML with <img> tags (webpage copy with text + images)
    if (html && /<img\s/i.test(html)) {
      e.preventDefault();
      insertSanitizedHtml(html);
      return;
    }

    // Case 2: Direct image files (screenshot, single image, image + text from apps)
    if (imageItems.length > 0) {
      e.preventDefault();
      // If there's also HTML text, insert it first
      if (html) {
        const temp = document.createElement('div');
        temp.innerHTML = DOMPurify.sanitize(html);
        temp.querySelectorAll('script, style, link, meta').forEach(el => el.remove());
        temp.querySelectorAll('*').forEach(el => {
          el.removeAttribute('style');
          el.removeAttribute('class');
        });
        const editor = editorRef.current;
        if (editor) {
          editor.focus();
          document.execCommand('insertHTML', false, temp.innerHTML);
        }
      }
      // Then insert images
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) insertImageAtCursor(file);
      }
      checkEditorEmpty();
      return;
    }

    // Case 3: Plain text or HTML without images — let browser handle
  }, [insertImageAtCursor, insertSanitizedHtml]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    for (const file of files) insertImageAtCursor(file);
  }, [insertImageAtCursor]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) insertImageAtCursor(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** 키보드 단축키 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key === 'b') {
      e.preventDefault();
      document.execCommand('bold');
    } else if (mod && e.key === 'i') {
      e.preventDefault();
      document.execCommand('italic');
    } else if (mod && e.key === 'u') {
      e.preventDefault();
      document.execCommand('underline');
    } else if (mod && e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      document.execCommand('strikeThrough');
    } else if (e.key === 'Tab') {
      // 표 내 Tab → 다음 셀 이동
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      let node: Node | null = sel.anchorNode;
      let cell: HTMLTableCellElement | null = null;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = (node as HTMLElement).tagName.toLowerCase();
          if (tag === 'td' || tag === 'th') { cell = node as HTMLTableCellElement; break; }
        }
        node = node.parentNode;
      }
      if (cell) {
        e.preventDefault();
        let next: HTMLTableCellElement | null;
        if (e.shiftKey) {
          // Shift+Tab → 이전 셀
          next = cell.previousElementSibling as HTMLTableCellElement | null;
          if (!next) {
            const prevRow = cell.parentElement?.previousElementSibling;
            if (prevRow) next = prevRow.lastElementChild as HTMLTableCellElement | null;
          }
        } else {
          next = cell.nextElementSibling as HTMLTableCellElement | null;
          if (!next) {
            const nextRow = cell.parentElement?.nextElementSibling;
            if (nextRow) next = nextRow.firstElementChild as HTMLTableCellElement | null;
          }
        }
        if (next) {
          const range = document.createRange();
          range.selectNodeContents(next);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  };

  // Track image removal from editor via DOM mutations
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const observer = new MutationObserver(() => {
      const currentUrls = new Set(
        Array.from(editor.querySelectorAll('img[data-blob]'))
          .map(img => img.getAttribute('src') || '')
      );
      for (const [url] of imageMapRef.current) {
        if (!currentUrls.has(url)) {
          URL.revokeObjectURL(url);
          imageMapRef.current.delete(url);
        }
      }
      setImageCount(imageMapRef.current.size);
    });
    observer.observe(editor, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const [url] of imageMapRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  const uploadAllImages = async (): Promise<Map<string, string>> => {
    const urlMap = new Map<string, string>();
    for (const [blobUrl, file] of imageMapRef.current) {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      // user 는 form 렌더 시점에 보장됨 (early return 가드, 754행 참조).
      const storageRef = ref(storage, `board_images/${user!.uid}/${fileName}`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const realUrl = await getDownloadURL(storageRef);
      urlMap.set(blobUrl, realUrl);
    }
    return urlMap;
  };

  const extractContent = (urlMap: Map<string, string>): { content: string; imageUrls: string[] } => {
    const editor = editorRef.current;
    if (!editor) return { content: '', imageUrls: [] };

    const imageUrls: string[] = [];
    const clone = editor.cloneNode(true) as HTMLElement;

    clone.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (urlMap.has(src)) {
        const realUrl = urlMap.get(src)!;
        imageUrls.push(realUrl);
        img.setAttribute('src', realUrl);
      } else if (src && !src.startsWith('blob:')) {
        imageUrls.push(src);
      }
    });

    let content = '';
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        content += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // 이미지
        if (tag === 'img') {
          content += `\n![image](${el.getAttribute('src') || ''})\n`;

        // 줄바꿈
        } else if (tag === 'br') {
          content += '\n';

        // 제목
        } else if (tag === 'h2') {
          if (content.length > 0 && !content.endsWith('\n')) content += '\n';
          content += '## ';
          el.childNodes.forEach(walk);
          content += '\n';
        } else if (tag === 'h3') {
          if (content.length > 0 && !content.endsWith('\n')) content += '\n';
          content += '### ';
          el.childNodes.forEach(walk);
          content += '\n';

        // 인용문
        } else if (tag === 'blockquote') {
          if (content.length > 0 && !content.endsWith('\n')) content += '\n';
          let inner = '';
          const innerWalk = (n: Node) => {
            if (n.nodeType === Node.TEXT_NODE) {
              inner += n.textContent || '';
            } else if (n.nodeType === Node.ELEMENT_NODE) {
              const t = (n as HTMLElement).tagName.toLowerCase();
              if (t === 'br') { inner += '\n'; }
              else if (t === 'div' || t === 'p') {
                if (inner.length > 0 && !inner.endsWith('\n')) inner += '\n';
                n.childNodes.forEach(innerWalk);
                if (!inner.endsWith('\n')) inner += '\n';
              } else {
                n.childNodes.forEach(innerWalk);
              }
            }
          };
          el.childNodes.forEach(innerWalk);
          const lines = inner.split('\n');
          for (const line of lines) {
            if (line || lines.indexOf(line) < lines.length - 1) {
              content += `> ${line}\n`;
            }
          }

        // 코드 블록
        } else if (tag === 'pre') {
          if (content.length > 0 && !content.endsWith('\n')) content += '\n';
          content += '```\n';
          content += el.textContent || '';
          if (!content.endsWith('\n')) content += '\n';
          content += '```\n';

        // 목록
        } else if (tag === 'ul') {
          if (content.length > 0 && !content.endsWith('\n')) content += '\n';
          el.querySelectorAll(':scope > li').forEach(li => {
            content += `- `;
            li.childNodes.forEach(walk);
            if (!content.endsWith('\n')) content += '\n';
          });
        } else if (tag === 'ol') {
          if (content.length > 0 && !content.endsWith('\n')) content += '\n';
          let idx = 1;
          el.querySelectorAll(':scope > li').forEach(li => {
            content += `${idx++}. `;
            li.childNodes.forEach(walk);
            if (!content.endsWith('\n')) content += '\n';
          });
        } else if (tag === 'li') {
          // li는 ul/ol에서 직접 처리하므로 여기선 자식만 순회
          el.childNodes.forEach(walk);

        // 표
        } else if (tag === 'table') {
          if (content.length > 0 && !content.endsWith('\n')) content += '\n';
          const rows = el.querySelectorAll('tr');
          rows.forEach((tr, ri) => {
            const cells = tr.querySelectorAll('th, td');
            const cellTexts = Array.from(cells).map(c => (c.textContent || '').trim());
            content += '| ' + cellTexts.join(' | ') + ' |\n';
            // 첫 행 뒤 구분선
            if (ri === 0) {
              content += '| ' + cellTexts.map(() => '---').join(' | ') + ' |\n';
            }
          });
          content += '\n';

        // 인라인 서식
        } else if (tag === 'b' || tag === 'strong') {
          content += '**';
          el.childNodes.forEach(walk);
          content += '**';
        } else if (tag === 'i' || tag === 'em') {
          content += '*';
          el.childNodes.forEach(walk);
          content += '*';
        } else if (tag === 's' || tag === 'strike' || tag === 'del') {
          content += '~~';
          el.childNodes.forEach(walk);
          content += '~~';
        } else if (tag === 'u') {
          // 마크다운 미지원 — plain text
          el.childNodes.forEach(walk);

        // 링크
        } else if (tag === 'a') {
          const href = el.getAttribute('href') || '';
          content += '[';
          el.childNodes.forEach(walk);
          content += `](${href})`;

        // 구분선
        } else if (tag === 'hr') {
          content += '\n---\n';

        // 일반 블록
        } else if (['div', 'p'].includes(tag)) {
          if (content.length > 0 && !content.endsWith('\n')) content += '\n';
          el.childNodes.forEach(walk);
          if (!content.endsWith('\n')) content += '\n';

        // 기타
        } else {
          el.childNodes.forEach(walk);
        }
      }
    };
    clone.childNodes.forEach(walk);

    return { content: content.trim(), imageUrls };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const editor = editorRef.current;
    const hasText = (editor?.textContent || '').trim().length > 0;
    const hasImages = (editor?.querySelectorAll('img').length || 0) > 0;
    if (!title.trim() || (!hasText && !hasImages)) return;

    try {
      setUploading(true);
      const urlMap = await uploadAllImages();
      const { content, imageUrls } = extractContent(urlMap);
      const postId = await createPost({
        boardType: isInquiry ? 'inquiry' : isDevlog ? 'devlog' : 'free',
        title,
        content,
        activityId: null,
        tags: isInquiry
          ? [feedbackType === 'bug' ? '버그' : feedbackType === 'feature' ? '기능요청' : feedbackType === 'question' ? '문의' : '기타']
          : tags.split(',').map(tag => tag.trim()).filter(Boolean),
        imageUrls,
        feedbackType: isInquiry ? feedbackType : null,
        isPrivate: isInquiry ? isPrivate : false,
      });
      navigate(`/board/${postId}`);
    } catch {
      alert(t('message.submitFailed'));
    } finally {
      setUploading(false);
    }
  };

  const isBusy = submitting || uploading;
  const canSubmit = title.trim() && !editorEmpty && !isBusy;

  // 권한 가드 — 모든 hook 호출 이후로 이동 (rules-of-hooks 준수).
  // Why: 이전엔 hook 선언 위에 early return 이 있어 user→login 전환 시 hook 순서 불일치.
  if (!user) return <Navigate to="/board" replace />;
  if (isDevlog) return <Navigate to="/board?type=devlog" replace />;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--line-soft)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-[length:var(--fs-xl)] font-bold text-[var(--ink-0)]">{isInquiry ? t('label.writingForm') : isDevlog ? t('label.writingDevlog') : t('label.writingPost')}</h1>
        </div>
        <Button
          type="submit"
          disabled={!canSubmit} variant="secondary" className="px-6 py-2 text-[length:var(--fs-sm)] font-bold rounded-[var(--r-lg)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? t('button.uploading') : submitting ? t('button.submitLoading') : t('button.submit')}
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="lg:flex lg:gap-6">
        {/* Left: Editor */}
        <div className="flex-1 min-w-0">
          <Card padding="none" className="rounded-[var(--r-xl)] overflow-hidden">
            {isInquiry && (
              <div className="px-5 pt-5 pb-3 border-b border-[var(--line-soft)]">
                <label className="text-[length:var(--fs-sm)] font-bold text-[var(--ink-0)] mb-2 block">{t('label.feedbackType')}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { value: 'bug' as const, label: t('label.feedbackTypes.bug'), icon: t('label.feedbackIcons.bug') },
                    { value: 'feature' as const, label: t('label.feedbackTypes.feature'), icon: t('label.feedbackIcons.feature') },
                    { value: 'question' as const, label: t('label.feedbackTypes.question'), icon: t('label.feedbackIcons.question') },
                    { value: 'other' as const, label: t('label.feedbackTypes.other'), icon: t('label.feedbackIcons.other') },
                  ]).map(feedbackItem => (
                    <button
                      key={feedbackItem.value}
                      type="button"
                      onClick={() => setFeedbackType(feedbackItem.value)}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-[var(--r-lg)] border-2 transition-all text-center ${
                        feedbackType === feedbackItem.value
                          ? 'border-[var(--lime)] bg-[var(--lime)]/10'
                          : 'border-[var(--line-soft)] hover:border-[var(--line)]'
                      }`}
                    >
                      <span className="text-[length:var(--fs-xl)]">{feedbackItem.icon}</span>
                      <span className={`text-[length:var(--fs-xs)] font-bold ${feedbackType === feedbackItem.value ? 'text-[var(--lime)]' : 'text-[var(--ink-2)]'}`}>
                        {feedbackItem.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Title */}
            <div className="px-5 pt-5">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                placeholder={t('placeholder.title')}
                className="w-full px-1 pb-3 text-[length:var(--fs-lg)] font-medium bg-transparent text-[var(--ink-0)] placeholder:text-[var(--ink-3)] focus:outline-none border-b border-[var(--line-soft)]"
              />
            </div>

            {/* Toolbar */}
            <div className="px-3 py-1.5 border-b border-[var(--line-soft)] flex items-center gap-0.5 overflow-x-auto">
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />

              {/* --- Insert --- */}
              <ToolBtn onClick={() => fileInputRef.current?.click()} disabled={imageCount >= MAX_IMAGES} title={t('toolbar.photo')}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
                <span className="text-[10px]">{t('toolbar.photo')}</span>
              </ToolBtn>
              <ToolBtn onClick={() => { editorRef.current?.focus(); document.execCommand('insertHorizontalRule'); }} title={t('toolbar.divider')}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14" /></svg>
                <span className="text-[10px]">{t('toolbar.divider')}</span>
              </ToolBtn>
              <ToolBtn onClick={() => { const url = prompt(t('toolbar.linkPrompt')); if (url) { editorRef.current?.focus(); document.execCommand('createLink', false, url); } }} title={t('toolbar.link')}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.02a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L5.336 9.12" /></svg>
                <span className="text-[10px]">{t('toolbar.link')}</span>
              </ToolBtn>

              <div className="h-5 w-px bg-[var(--line-soft)] mx-1" />

              {/* --- Block --- */}
              <ToolBtn onClick={() => toggleBlock('H2')} active={formatState.blockType === 'h2'} title={t('toolbar.h2')}>
                <span className="font-bold text-[length:var(--fs-xs)]">H2</span>
              </ToolBtn>
              <ToolBtn onClick={() => toggleBlock('H3')} active={formatState.blockType === 'h3'} title={t('toolbar.h3')}>
                <span className="font-bold text-[length:var(--fs-xs)]">H3</span>
              </ToolBtn>

              <div className="h-5 w-px bg-[var(--line-soft)] mx-1" />

              {/* --- Structure --- */}
              <ToolBtn onClick={() => { editorRef.current?.focus(); document.execCommand('insertUnorderedList'); setTimeout(updateFormatState, 0); }} active={formatState.listType === 'ul'} title={t('toolbar.unorderedList')}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" /></svg>
              </ToolBtn>
              <ToolBtn onClick={() => { editorRef.current?.focus(); document.execCommand('insertOrderedList'); setTimeout(updateFormatState, 0); }} active={formatState.listType === 'ol'} title={t('toolbar.orderedList')}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 6.75h12M8.25 12h12m-12 5.25h12" /><text x="2" y="8" fontSize="6" fill="currentColor" fontWeight="bold">1</text><text x="2" y="13.5" fontSize="6" fill="currentColor" fontWeight="bold">2</text><text x="2" y="19" fontSize="6" fill="currentColor" fontWeight="bold">3</text></svg>
              </ToolBtn>
              <ToolBtn onClick={() => toggleBlock('BLOCKQUOTE')} active={formatState.blockType === 'blockquote'} title={t('toolbar.quote')}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.2 48.2 0 005.327-.652c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
              </ToolBtn>
              <ToolBtn onClick={insertCodeBlock} active={formatState.blockType === 'pre'} title={t('toolbar.code')}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
              </ToolBtn>

              {/* --- Table picker --- */}
              <div className="relative" ref={tablePickerRef}>
                <ToolBtn onClick={() => setShowTablePicker(prev => !prev)} title={t('toolbar.table')}>
                  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12c-.621 0-1.125.504-1.125 1.125M12 12c0 .621.504 1.125 1.125 1.125M12 12c0-.621.504-1.125 1.125-1.125m1.5 2.625c0-.621.504-1.125 1.125-1.125" /></svg>
                </ToolBtn>
                {showTablePicker && (
                  <div className="absolute top-full left-0 mt-1 p-3 rounded-[var(--r-lg)] z-50" style={{ background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
                    <div className="text-[length:var(--fs-xs)] text-[var(--ink-3)] mb-2 text-center">
                      {tableHover.rows > 0 ? t('toolbar.tableSize', { rows: tableHover.rows, cols: tableHover.cols }) : t('toolbar.tableSizePrompt')}
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                      {Array.from({ length: 36 }).map((_, i) => {
                        const row = Math.floor(i / 6) + 1;
                        const col = (i % 6) + 1;
                        const isHighlighted = row <= tableHover.rows && col <= tableHover.cols;
                        return (
                          <div
                            key={i}
                            onMouseEnter={() => setTableHover({ rows: row, cols: col })}
                            onMouseDown={(e) => { e.preventDefault(); insertTable(row, col); }}
                            className={`w-5 h-5 border rounded-[var(--r-sm)] cursor-pointer transition-colors ${
                              isHighlighted
                                ? 'bg-[var(--lime)] border-[var(--lime)]'
                                : 'bg-[var(--bg-3)] border-[var(--line-soft)] hover:bg-[var(--bg-4)]'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-5 w-px bg-[var(--line-soft)] mx-1" />

              {/* --- Inline --- */}
              <ToolBtn onClick={() => { editorRef.current?.focus(); document.execCommand('bold'); }} active={formatState.bold} title={t('toolbar.bold')}>
                <span className="font-bold text-[length:var(--fs-sm)]">B</span>
              </ToolBtn>
              <ToolBtn onClick={() => { editorRef.current?.focus(); document.execCommand('italic'); }} active={formatState.italic} title={t('toolbar.italic')}>
                <span className="italic text-[length:var(--fs-sm)]">I</span>
              </ToolBtn>
              <ToolBtn onClick={() => { editorRef.current?.focus(); document.execCommand('underline'); }} active={formatState.underline} title={t('toolbar.underline')}>
                <span className="underline text-[length:var(--fs-sm)]">U</span>
              </ToolBtn>
              <ToolBtn onClick={() => { editorRef.current?.focus(); document.execCommand('strikeThrough'); }} active={formatState.strikeThrough} title={t('toolbar.strikeThrough')}>
                <span className="line-through text-[length:var(--fs-sm)]">S</span>
              </ToolBtn>
            </div>

            {/* Editor content area */}
            <div
              className="relative"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {editorEmpty && (
                <div className="absolute inset-0 px-5 py-4 text-[var(--ink-3)] text-[length:var(--fs-sm)] pointer-events-none select-none">
                  {t('placeholder.editorHint')}
                </div>
              )}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={checkEditorEmpty}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                className={`px-5 py-4 min-h-[480px] text-[length:var(--fs-sm)] leading-relaxed text-[var(--ink-1)] focus:outline-none
                  [&_img]:max-w-full [&_img]:rounded-[var(--r-lg)] [&_img]:my-3
                  [&_h2]:text-[length:var(--fs-xl)] [&_h2]:font-bold [&_h2]:my-3
                  [&_h3]:text-[length:var(--fs-lg)] [&_h3]:font-semibold [&_h3]:my-2
                  [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--lime)] [&_blockquote]:pl-4 [&_blockquote]:my-3 [&_blockquote]:text-[var(--ink-3)] [&_blockquote]:italic
                  [&_pre]:bg-[var(--bg-3)] [&_pre]:rounded-[var(--r-lg)] [&_pre]:p-4 [&_pre]:my-3 [&_pre]:font-mono [&_pre]:text-[length:var(--fs-sm)] [&_pre]:whitespace-pre-wrap
                  [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6
                  [&_table]:w-full [&_table]:border-collapse [&_table]:my-3
                  [&_th]:border [&_th]:border-[var(--line)] [&_th]:px-3 [&_th]:py-2 [&_th]:bg-[var(--bg-2)] [&_th]:text-[length:var(--fs-sm)] [&_th]:font-semibold
                  [&_td]:border [&_td]:border-[var(--line)] [&_td]:px-3 [&_td]:py-2 [&_td]:text-[length:var(--fs-sm)]`}
                style={{ wordBreak: 'break-word' }}
              />
            </div>
          </Card>
        </div>

        {/* Right: Sidebar */}
        <div className="mt-6 lg:mt-0 lg:w-64 flex-shrink-0 space-y-4">
          {/* Tags / Private */}
          <Card padding="none" className="rounded-[var(--r-xl)] p-4">
            {isInquiry ? (
              <label className="flex items-center gap-2 px-1 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={e => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 rounded-[var(--r-sm)] border-[var(--line)] text-[var(--lime)] focus:ring-[var(--lime)]"
                />
                <span className="text-[length:var(--fs-sm)] text-[var(--ink-1)]">
                  {t('label.private')} <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)]">{t('label.privateHint')}</span>
                </span>
              </label>
            ) : (
              <>
                <h3 className="text-[length:var(--fs-sm)] font-semibold text-[var(--ink-0)] mb-3">{t('label.tags')}</h3>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder={t('placeholder.tags')}
                  className="w-full px-3 py-2 rounded-[var(--r-lg)] text-[length:var(--fs-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--lime)]"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink-1)' }}
                />
                <p className="text-[10px] text-[var(--ink-3)] mt-1.5">{t('placeholder.tagExample')}</p>
              </>
            )}
          </Card>

          {/* Image count */}
          <Card padding="none" className="rounded-[var(--r-xl)] p-4">
            <h3 className="text-[length:var(--fs-sm)] font-semibold text-[var(--ink-0)] mb-2">{t('label.imageCount')}</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-[var(--bg-3)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--lime)] rounded-full transition-all"
                  style={{ width: `${(imageCount / MAX_IMAGES) * 100}%` }}
                />
              </div>
              <span className="text-[length:var(--fs-xs)] text-[var(--ink-3)] tabular-nums">{imageCount}/{MAX_IMAGES}</span>
            </div>
            <p className="text-[10px] text-[var(--ink-3)] mt-2">
              {t('placeholder.attachmentHint')}
            </p>
          </Card>
        </div>
      </div>
    </form>
  );
};

/* Toolbar button */
const ToolBtn: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}> = ({ children, onClick, disabled, active, title }) => (
  <button
    type="button"
    onClick={onClick}
    onMouseDown={(e) => e.preventDefault()}
    disabled={disabled}
    title={title}
    className={`flex flex-col items-center justify-center w-10 h-10 rounded-[var(--r-lg)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
      active
        ? 'bg-[var(--lime)]/20 text-[var(--lime)]'
        : 'text-[var(--ink-3)] hover:bg-[var(--bg-2)] hover:text-[var(--ink-1)]'
    }`}
  >
    {children}
  </button>
);

export default CreatePostPage;
