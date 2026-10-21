import { createRef } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Alert, Button, Card, Chip, Field, IconButton, Input, Progress, Select, Textarea } from './index';
import { cn } from './cn';

describe('cn()', () => {
  it('falsy 무시, 객체 key 조건부 추가, 배열 평탄화', () => {
    expect(cn('a', false, null, 'b', ['c', 0, ['d']], { e: true, f: false })).toBe('a b c d e');
  });
});

describe('Button', () => {

  it('loading 시 disabled + spinner 표시', () => {
    render(<Button loading>업로드</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.querySelector('.ds-btn__spinner')).toBeTruthy();
  });

  it('기본 type 은 button (form submit 방지)', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });
});

describe('Card', () => {

  it('onClick 카드에 button 역할과 키보드 실행을 부여', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>열기</Card>);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Chip', () => {

  it('selectable/onClick 칩은 키보드로 실행 가능', () => {
    const onClick = vi.fn();
    render(<Chip selectable onClick={onClick}>AI</Chip>);
    const chip = screen.getByRole('button');
    fireEvent.keyDown(chip, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Input + Field', () => {
  it('Field 가 label 과 input 연결', () => {
    render(
      <Field label="제목" htmlFor="t" hint="필수">
        <Input id="t" defaultValue="x" />
      </Field>,
    );
    expect(screen.getByText('제목')).toBeTruthy();
    expect(screen.getByText('필수')).toBeTruthy();
    expect((screen.getByLabelText('제목') as HTMLInputElement).value).toBe('x');
  });

  it('invalid 시 ds-input--invalid', () => {
    const { container } = render(<Input invalid />);
    const input = container.querySelector('input')!;
    expect(input.className).toMatch(/\bds-input--invalid\b/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('endAction preserves the native input ref, form value and click/Enter submission', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      expect(new FormData(event.currentTarget).get('query')).toBe('ride');
    });
    render(<form onSubmit={onSubmit}><Input ref={ref} name="query" aria-label="Search" defaultValue="ride" endAction={<IconButton type="submit" aria-label="Run search" icon={<svg />} />} /></form>);
    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Search' }));
    expect(ref.current).not.toHaveAttribute('endAction');
    await user.click(screen.getByRole('button', { name: 'Run search' }));
    await user.click(ref.current!);
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('filter Select keeps native selection, label, disabled and invalid semantics', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Field label="종목" htmlFor="filter-sport"><Select id="filter-sport" variant="filter" defaultValue="all" onChange={onChange}><option value="all">전체</option><option value="run">러닝</option></Select></Field>);
    const select = screen.getByRole('combobox', { name: '종목' });
    fireEvent.change(select, { target: { value: 'run' } });
    expect(select).toHaveValue('run');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveAttribute('variant');
    rerender(<Select variant="filter" aria-label="종목" invalid disabled><option value="run">러닝</option></Select>);
    expect(screen.getByRole('combobox', { name: '종목' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '종목' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('compact Textarea starts with one row while preserving explicit rows and native resizing', () => {
    const { rerender } = render(<Textarea compact aria-label="짧은 댓글" />);
    const input = screen.getByRole('textbox', { name: '짧은 댓글' });
    expect(input).toHaveAttribute('rows', '1');
    expect(input).not.toHaveAttribute('compact');
    fireEvent.change(input, { target: { value: '첫 줄\n두 번째 줄' } });
    expect(input).toHaveValue('첫 줄\n두 번째 줄');
    input.style.height = '120px';
    fireEvent.input(input);
    expect(input.style.height).toBe('120px');
    rerender(<Textarea compact rows={4} aria-label="짧은 댓글" />);
    expect(input).toHaveAttribute('rows', '4');
    rerender(<Textarea aria-label="짧은 댓글" />);
    expect(input).not.toHaveAttribute('rows');
    expect(input).not.toHaveClass('ds-textarea--compact');
  });

  it('Textarea/Select invalid 도 aria-invalid 를 연결', () => {
    render(
      <>
        <Textarea invalid aria-label="설명" />
        <Select invalid aria-label="종류"><option>자전거</option></Select>
      </>,
    );
    expect(screen.getByLabelText('설명')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('종류')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('IconButton', () => {
  it('loading 시 disabled + spinner 표시', () => {
    render(<IconButton aria-label="저장" icon={<svg />} loading />);
    const btn = screen.getByRole('button', { name: '저장' });
    expect(btn).toBeDisabled();
    expect(btn.querySelector('.ds-btn__spinner')).toBeTruthy();
  });
});

describe('Alert', () => {
  it('variant 별 클래스 + role="alert"', () => {
    const { container } = render(<Alert variant="warning" title="주의">메시지</Alert>);
    const el = container.firstElementChild!;
    expect(el.className).toMatch(/\bds-alert--warning\b/);
    expect(el.getAttribute('role')).toBe('alert');
    expect(screen.getByText('주의')).toBeTruthy();
  });
});

describe('Progress', () => {
  it('0..1 과 0..100 둘 다 받아 aria-valuenow 설정', () => {
    const { rerender, container } = render(<Progress value={0.72} />);
    expect(container.firstElementChild?.getAttribute('aria-valuenow')).toBe('72');
    rerender(<Progress value={45} />);
    expect(container.firstElementChild?.getAttribute('aria-valuenow')).toBe('45');
  });

  it('범위 밖 값은 클램프', () => {
    const { container, rerender } = render(<Progress value={-10} />);
    expect(container.firstElementChild?.getAttribute('aria-valuenow')).toBe('0');
    rerender(<Progress value={200} />);
    expect(container.firstElementChild?.getAttribute('aria-valuenow')).toBe('100');
  });
});

describe('IconButton', () => {
  it('aria-label 적용 + icon-only 클래스', () => {
    render(<IconButton aria-label="설정" icon={<svg />} />);
    const btn = screen.getByRole('button', { name: '설정' });
    expect(btn.className).toMatch(/\bds-btn--icon-only\b/);
  });
});
