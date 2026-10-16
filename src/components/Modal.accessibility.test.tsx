import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

describe('opt-in modal keyboard access', () => {
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
  it('preserves the existing non-opt-in Escape behavior', () => {
    const close=vi.fn();render(<Modal open onClose={close} title="Legacy modal"><button>Legacy action</button></Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(document,{key:'Escape'});expect(close).toHaveBeenCalledTimes(1);
  });
});
