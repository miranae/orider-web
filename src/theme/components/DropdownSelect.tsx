import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './cn';
import './DropdownSelect.css';
import { ICON_SIZE } from '../tokens/icon';

export interface DropdownSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly DropdownSelectOption[];
  label: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Opt in when a portaled menu must appear above its containing dialog. */
  menuZIndex?: number;
}

/** Opt-in single selection; focus stays on the combobox while its listbox is open. */
export function DropdownSelect({ value, onChange, options, label, id, placeholder = '', disabled, className, menuZIndex }: DropdownSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const enabled = options.filter(option => !option.disabled);
  const unavailable = disabled || enabled.length === 0;
  const selected = options.find(option => option.value === value);
  const activeIndex = options.findIndex(option => option.value === activeValue);

  function close(restoreFocus = false) {
    setOpen(false);
    search.current = { text: '', at: 0 };
    if (restoreFocus) triggerRef.current?.focus();
  }

  function show(last = false) {
    if (unavailable) return;
    setPosition(null);
    setActiveValue(enabled.find(option => option.value === value)?.value ?? (last ? enabled[enabled.length - 1]?.value : enabled[0]?.value) ?? null);
    setOpen(true);
  }

  function choose(next: string) {
    if (!enabled.some(option => option.value === next)) return;
    onChange(next);
    close(true);
  }

  useEffect(() => {
    if (!open) return;
    if (unavailable) { setOpen(false); return; }
    if (!enabled.some(option => option.value === activeValue)) setActiveValue(enabled[0]?.value ?? null);
  }, [open, unavailable, options, activeValue]); // options may change while the list is open.

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!triggerRef.current || !menuRef.current) return;
      const trigger = triggerRef.current.getBoundingClientRect();
      const margin = 12;
      const gap = 4;
      const width = Math.max(0, Math.min(Math.max(trigger.width, 240), window.innerWidth - margin * 2));
      const below = window.innerHeight - trigger.bottom - margin - gap;
      const above = trigger.top - margin - gap;
      const maxHeight = Math.max(0, Math.min(320, Math.max(below, above)));
      const height = Math.min(menuRef.current.scrollHeight, maxHeight);
      const top = below >= height || below >= above ? trigger.bottom + gap : trigger.top - height - gap;
      const next = { left: Math.max(margin, Math.min(trigger.left, window.innerWidth - width - margin)), top: Math.max(margin, top), width, maxHeight };
      setPosition(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, options, position?.width]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeValue]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (unavailable) return;
    setKeyboardNavigation(true);
    if (event.key === 'Tab') { if (open) close(); return; }
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); event.stopPropagation(); close(true); }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show(event.key === 'ArrowUp' || event.key === 'End');
        if (event.key === 'Home') setActiveValue(enabled[0]?.value ?? null);
        if (event.key === 'End') setActiveValue(enabled[enabled.length - 1]?.value ?? null);
      } else {
        const index = enabled.findIndex(option => option.value === activeValue);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
        setActiveValue(enabled[next]?.value ?? null);
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open && activeValue !== null) choose(activeValue);
      else show();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const time = Date.now();
      const text = (time - search.current.at < 600 ? search.current.text : '') + event.key.toLocaleLowerCase();
      search.current = { text, at: time };
      const query = [...text].every(char => char === text[0]) ? text[0]! : text;
      const start = enabled.findIndex(option => option.value === (open ? activeValue : value));
      const ordered = [...enabled.slice(start + 1), ...enabled.slice(0, start + 1)];
      const match = ordered.find(option => option.label.toLocaleLowerCase().startsWith(query));
      if (!open) show();
      if (match) setActiveValue(match.value);
    }
  }

  return <div className={cn('ds-dropdown-select', className)}>
    <button ref={triggerRef} id={triggerId} type="button" role="combobox" aria-label={label}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      disabled={unavailable} className="ds-dropdown-select__trigger" onKeyDown={onKeyDown}
      onBlur={event => { if (!menuRef.current?.contains(event.relatedTarget)) close(); }}
      onClick={() => { setKeyboardNavigation(false); if (open) close(); else show(); }}>
      <span>{selected?.label ?? placeholder}</span><ChevronDown size={ICON_SIZE.md} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menuRef} id={listId} role="listbox" aria-label={label} className="ds-dropdown-select__menu"
      style={{ ...position, zIndex: menuZIndex, visibility: position ? 'visible' : 'hidden' }}>
      {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option"
        aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
        data-active={option.value === activeValue} data-keyboard-active={keyboardNavigation && option.value === activeValue} className="ds-dropdown-select__option"
        onPointerMove={() => { setKeyboardNavigation(false); if (!option.disabled) setActiveValue(option.value); }}
        onMouseDown={event => event.preventDefault()} onClick={() => { if (!option.disabled) choose(option.value); }}>
        <span>{option.label}</span>{option.value === value && <Check size={ICON_SIZE.md} aria-hidden="true" />}
      </div>)}
    </div>, document.body)}
  </div>;
}
