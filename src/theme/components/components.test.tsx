import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { Alert, Button, Card, Chip, Field, IconButton, Input, Progress, Select, Stack, Stat, Switch, Text, Textarea } from './index';
import { cn } from './cn';

describe('cn()', () => {
  it('falsy 무시, 객체 key 조건부 추가, 배열 평탄화', () => {
    expect(cn('a', false, null, 'b', ['c', 0, ['d']], { e: true, f: false })).toBe('a b c d e');
  });
});

describe('Button', () => {
  it('variant 와 size 가 BEM 클래스로 매핑', () => {
    render(<Button variant="primary" size="lg">시작</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/\bds-btn--primary\b/);
    expect(btn.className).toMatch(/\bds-btn--lg\b/);
  });

  it('loading 시 disabled + spinner 표시', () => {
    render(<Button loading>업로드</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.querySelector('.ds-btn__spinner')).toBeTruthy();
  });

  it('iconOnly 일 때 ds-btn--icon-only 클래스', () => {
    render(<Button iconOnly aria-label="설정"><svg /></Button>);
    expect(screen.getByRole('button').className).toMatch(/\bds-btn--icon-only\b/);
  });

  it('기본 type 은 button (form submit 방지)', () => {
    render(<Button>x</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });
});

describe('Card', () => {
  it('title/sub 헤더 렌더', () => {
    render(<Card title="요약" sub="WEEK 21">본문</Card>);
    expect(screen.getByText('요약')).toBeTruthy();
    expect(screen.getByText('WEEK 21')).toBeTruthy();
    expect(screen.getByText('본문')).toBeTruthy();
  });

  it('variant flat 적용', () => {
    const { container } = render(<Card variant="flat">x</Card>);
    expect(container.firstElementChild?.className).toMatch(/\bds-card--flat\b/);
  });

  it('onClick 카드에 button 역할과 키보드 실행을 부여', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>열기</Card>);
    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Chip', () => {
  it('variant accent + dot 렌더', () => {
    const { container } = render(<Chip variant="accent" dot>연결됨</Chip>);
    const chip = container.firstElementChild!;
    expect(chip.className).toMatch(/\bds-chip--accent\b/);
    expect(chip.querySelector('.ds-chip__dot')).toBeTruthy();
  });

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

describe('Switch', () => {
  it('label prop 시 라벨 텍스트 노출', () => {
    render(<Switch label="자동 업로드" defaultChecked />);
    expect(screen.getByText('자동 업로드')).toBeTruthy();
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

describe('Stack', () => {
  it('direction=row, gap, wrap 적용', () => {
    const { container } = render(
      <Stack direction="row" gap={12} wrap><span>a</span></Stack>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toMatch(/\bds-stack--row\b/);
    expect(el.className).toMatch(/\bds-stack--wrap\b/);
    expect(el.style.getPropertyValue('--ds-stack-gap')).toBe('12px');
  });
});

describe('Stat', () => {
  it('label/value/unit/delta 모두 렌더', () => {
    render(<Stat label="총 거리" value={235} unit="km" delta={{ value: '+18%', direction: 'up' }} />);
    expect(screen.getByText('총 거리')).toBeTruthy();
    expect(screen.getByText('235')).toBeTruthy();
    expect(screen.getByText('km')).toBeTruthy();
    expect(screen.getByText(/▲ \+18%/)).toBeTruthy();
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

describe('Text', () => {
  it('pageTitle variant 는 h1 페이지 제목 클래스로 매핑', () => {
    render(<Text as="h1" variant="pageTitle">페이지 제목</Text>);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toMatch(/\bds-text--page-title\b/);
  });

  it('variant + size + tone 클래스 매핑', () => {
    const { container } = render(<Text variant="title" size="lg" tone="accent">x</Text>);
    const el = container.firstElementChild!;
    expect(el.className).toMatch(/\bds-text--title\b/);
    expect(el.className).toMatch(/\bds-text--size-lg\b/);
    expect(el.className).toMatch(/\bds-text--tone-accent\b/);
  });

  it('as prop 으로 의미 태그 변경', () => {
    const { container } = render(<Text as="h1" variant="title">제목</Text>);
    expect(container.firstElementChild?.tagName).toBe('H1');
  });

  it('truncate 클래스 적용', () => {
    const { container } = render(<Text truncate>긴 텍스트입니다</Text>);
    expect(container.firstElementChild?.className).toMatch(/\bds-text--truncate\b/);
  });

  it('기본 한글 조판 보호 규칙을 가진다', () => {
    const css = readFileSync(join(process.cwd(), 'src/theme/components/components.css'), 'utf8');
    expect(css).toContain('.ds-text { color: inherit; overflow-wrap: anywhere; word-break: keep-all; }');
    expect(css).toContain('.ds-card__title { margin: 0; font-size: var(--fs-lg);');
  });
});

describe('IconButton', () => {
  it('aria-label 적용 + icon-only 클래스', () => {
    render(<IconButton aria-label="설정" icon={<svg />} />);
    const btn = screen.getByRole('button', { name: '설정' });
    expect(btn.className).toMatch(/\bds-btn--icon-only\b/);
  });

  it('variant 기본값 ghost', () => {
    const { container } = render(<IconButton aria-label="x" icon={<svg />} />);
    expect(container.firstElementChild?.className).toMatch(/\bds-btn--ghost\b/);
  });
});

describe('Card padding prop', () => {
  it('padding="none" 시 inline padding:0', () => {
    const { container } = render(<Card padding="none">x</Card>);
    expect((container.firstElementChild as HTMLElement).style.padding).toBe('0px');
  });

  it('padding="none" 이라도 className padding 이 있으면 inline padding 으로 막지 않음', () => {
    const { container } = render(<Card padding="none" className="p-4 md:p-6">x</Card>);
    expect((container.firstElementChild as HTMLElement).style.padding).toBe('');
  });

  it('padding="card"(기본) 시 inline padding 미설정 → CSS 기본 16px 사용', () => {
    const { container } = render(<Card>x</Card>);
    expect((container.firstElementChild as HTMLElement).style.padding).toBe('');
  });

  it('padding 숫자 전달 시 그대로 적용', () => {
    const { container } = render(<Card padding={24}>x</Card>);
    expect((container.firstElementChild as HTMLElement).style.padding).toBe('24px');
  });
});
