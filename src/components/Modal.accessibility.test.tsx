import { useState } from 'react';
import { DialogProvider, useDialog } from '../contexts/DialogContext';
import tokens from '../../design-tokens/orider.tokens.json';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

describe('shared modal keyboard access', () => {
  it('names the dialog, contains focus, closes once on Escape, and restores the opener', () => {
    const close = vi.fn();
    function Fixture() {
      const [open,setOpen]=useState(false);
      return <><button onClick={()=>setOpen(true)}>Open club dialog</button><Modal accessible open={open} onClose={()=>{close();setOpen(false);}} title="Create a club"><input aria-label="Club name"/><button>Final action</button></Modal></>;
    }
    render(<Fixture/>);
    const opener=screen.getByRole('button',{name:'Open club dialog'});
    opener.focus(); fireEvent.click(opener);
    expect(screen.getByRole('dialog',{name:'Create a club'})).toHaveAttribute('aria-modal','true');
    const first=screen.getByRole('button',{name:'닫기'});
    const last=screen.getByRole('button',{name:'Final action'});
    expect(first).toHaveFocus();
    fireEvent.keyDown(first,{key:'Tab',shiftKey:true});expect(last).toHaveFocus();
    fireEvent.keyDown(last,{key:'Tab'});expect(first).toHaveFocus();
    opener.focus();expect(first).toHaveFocus();
    fireEvent.keyDown(first,{key:'Escape'});
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
  it('gives legacy callers a named dialog while preserving Escape cancellation', () => {
    const close=vi.fn();render(<Modal open onClose={close} title="Legacy modal"><button>Legacy action</button></Modal>);
    expect(screen.getByRole('dialog', { name: 'Legacy modal' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document,{key:'Escape'});expect(close).toHaveBeenCalledTimes(1);
  });
});

it('portals above the app stacking context and preserves an optional scoped wrapper', () => {
  const { container } = render(<div style={{ position: 'relative', zIndex: 0 }}><Modal open portalClassName="ride-story-picker" title="Scoped picker" onClose={vi.fn()}><button>Pick</button></Modal></div>);
  const dialog = screen.getByRole('dialog', { name: 'Scoped picker' });
  expect(container).not.toContainElement(dialog);
  const wrapper = document.body.querySelector('.ride-story-picker');
  expect(wrapper?.parentElement).toBe(document.body);
  expect(wrapper?.querySelector(':scope > .fixed')).toContainElement(dialog);
  expect((wrapper?.firstElementChild as HTMLElement).style.zIndex).toBe("var(--layer-modal)");
  expect(Number(tokens.staticCssVariables["--layer-modal"])).toBeGreaterThan(50);
});
it('blocks close controls, backdrop and Escape while busy and restores cancellation afterward', () => {
  const close = vi.fn();
  const view = render(<Modal open busy title="Saving" onClose={close}><button>Content</button></Modal>);
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(screen.getByRole('button', { name: '닫기' }));
  fireEvent.click(document.body.querySelector('.fixed > .absolute')!);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(close).not.toHaveBeenCalled();
  view.rerender(<Modal open title="Saving" onClose={close}><button>Content</button></Modal>);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
});

it('keeps an awaited app alert above a high-layer modal and returns focus before outer dismissal', async () => {
  function AlertAction() {
    const dialog = useDialog();
    return <button onClick={() => { void dialog.alert('Nested failure'); }}>Show error</button>;
  }
  const close = vi.fn();
  render(<DialogProvider><Modal open layer={9999} title="Underlying report" onClose={close}><AlertAction /></Modal></DialogProvider>);
  const show = screen.getByRole('button', { name: 'Show error' });
  show.focus(); fireEvent.click(show);
  const alert = screen.getByRole('dialog', { name: '알림' });
  expect(alert).toContainElement(document.activeElement as HTMLElement);
  expect(Number(tokens.staticCssVariables['--layer-app-dialog'])).toBeGreaterThan(10000);
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(screen.queryByText('Nested failure')).not.toBeInTheDocument();
  expect(show).toHaveFocus(); expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(show, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
});
