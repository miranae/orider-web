import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropdownSelect, type DropdownSelectOption } from './DropdownSelect';

const options: DropdownSelectOption[] = [
  { value: 'alpha', label: 'Alpha club' },
  { value: 'blocked', label: 'Blocked club', disabled: true },
  { value: 'beta', label: 'Beta club with a long name that wraps within the viewport' },
  { value: 'gamma', label: 'Gamma club' },
];

function Controlled({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('alpha');
  return <><DropdownSelect label="Club you manage" options={options} value={value}
    onChange={next => { setValue(next); onChange(next); }} /><button>Next field</button></>;
}

afterEach(() => vi.restoreAllMocks());

describe('DropdownSelect', () => {
  it('opens a portal listbox, selects a row, restores focus and preserves the controlled value', () => {
    const onChange = vi.fn();
    const { container } = render(<Controlled onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Club you manage' });
    trigger.focus();
    fireEvent.click(trigger);
    const list = screen.getByRole('listbox');
    expect(container.contains(list)).toBe(false);
    expect(trigger).toHaveAttribute('aria-controls', list.id);
    expect(screen.getByRole('option', { name: 'Alpha club' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('option', { name: /Beta club/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('beta');
    expect(trigger).toHaveTextContent('Beta club with a long name');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('supports arrows, Home/End, skips disabled rows and commits only on Enter', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Beta club/ })).toHaveAttribute('data-keyboard-active', 'true');
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /Beta club/ }).id);
    fireEvent.keyDown(trigger, { key: 'End' });
    expect(screen.getByRole('option', { name: 'Gamma club' })).toHaveAttribute('data-active', 'true');
    fireEvent.keyDown(trigger, { key: 'Home' });
    expect(screen.getByRole('option', { name: 'Alpha club' })).toHaveAttribute('data-active', 'true');
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: 'Gamma club' })).toHaveAttribute('data-active', 'true');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('gamma');
    expect(trigger).toHaveFocus();
  });

  it('opens on the last enabled option for End and the first for Home', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'End' });
    expect(screen.getByRole('option', { name: 'Gamma club' })).toHaveAttribute('data-keyboard-active', 'true');
    expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Gamma club' }).id);
    expect(screen.getByRole('option', { name: 'Alpha club' })).toHaveAttribute('aria-selected', 'true');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('gamma');
    fireEvent.keyDown(trigger, { key: 'Home' });
    expect(screen.getByRole('option', { name: 'Alpha club' })).toHaveAttribute('data-keyboard-active', 'true');
  });

  it('supports typeahead and Escape without changing a selection', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'b' });
    fireEvent.keyDown(trigger, { key: 'e' });
    expect(screen.getByRole('option', { name: /Beta club/ })).toHaveAttribute('data-active', 'true');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent('Alpha club');
  });

  it('closes for Tab and outside pointer clicks without trapping or stealing focus', () => {
    render(<Controlled />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(trigger, tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger);
    const next = screen.getByRole('button', { name: 'Next field' });
    next.focus();
    fireEvent.pointerDown(next);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(next).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps an unknown value unchanged and disables empty or explicitly disabled controls', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DropdownSelect label="Clubs" value="missing" options={options} onChange={onChange} placeholder="Choose a club" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose a club');
    expect(onChange).not.toHaveBeenCalled();
    rerender(<DropdownSelect label="Clubs" value="missing" options={[]} onChange={onChange} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).toBeNull();
    rerender(<DropdownSelect label="Clubs" value="alpha" options={options} disabled onChange={onChange} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('opts a dialog menu into its requested portal layer without changing selection', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DropdownSelect label="Report reason" value="alpha" options={options} onChange={onChange} menuZIndex={10000} />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toHaveStyle({ zIndex: '10000' });
    fireEvent.click(screen.getByRole('option', { name: 'Gamma club' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('gamma');
    expect(trigger).toHaveFocus();
    rerender(<DropdownSelect label="Report reason" value="gamma" options={options} onChange={onChange} />);
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox').style.zIndex).toBe('');
  });

  it('clamps the popup to a 320px viewport and wraps long option labels', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 260, right: 520, top: 540, bottom: 576, width: 260, height: 36 } as DOMRect);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(240);
    render(<Controlled />);
    fireEvent.click(screen.getByRole('combobox'));
    const list = screen.getByRole('listbox');
    expect(list).toHaveStyle({ left: '48px', top: '296px', width: '260px', maxHeight: '320px' });
    expect(within(list).getByRole('option', { name: /Beta club with a long name/ })).toBeInTheDocument();
  });
});
