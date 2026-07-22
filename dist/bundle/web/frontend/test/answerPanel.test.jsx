import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { AnswerPanel } from '../src/components/AnswerPanel.jsx';

describe('AnswerPanel', () => {
  it('renders the answer-panel container', () => {
    render(<AnswerPanel />);
    expect(screen.getByTestId('answer-panel')).toBeTruthy();
  });

  it('R-3.1: renders markdown as formatted HTML via marked()', () => {
    const { container } = render(<AnswerPanel markdown={'# Hello\n\n**bold**'} />);
    const panel = screen.getByTestId('answer-panel');
    const h1 = panel.querySelector('h1');
    expect(h1).toBeTruthy();
    expect(h1.textContent).toContain('Hello');
    expect(panel.querySelector('strong')).toBeTruthy();
  });

  it('R-3.2: shows the running indicator only while running is true', () => {
    const { rerender } = render(<AnswerPanel running={true} />);
    expect(screen.queryByTestId('answer-running')).toBeTruthy();

    rerender(<AnswerPanel running={false} />);
    expect(screen.queryByTestId('answer-running')).toBeNull();
  });

  it('R-3.3: shows a "no answer produced" message when done and no markdown', () => {
    const { rerender } = render(<AnswerPanel done={true} markdown="" />);
    expect(screen.queryByTestId('answer-none')).toBeTruthy();

    rerender(<AnswerPanel done={true} markdown={'# Hi'} />);
    expect(screen.queryByTestId('answer-none')).toBeNull();
  });

  it('R-3.4: reflects the latest markdown across re-renders (streaming partials)', () => {
    const { rerender } = render(<AnswerPanel markdown="Hello" />);
    let panel = screen.getByTestId('answer-panel');
    expect(panel.textContent).toContain('Hello');
    expect(panel.textContent).not.toContain('world');

    rerender(<AnswerPanel markdown="Hello world" />);
    panel = screen.getByTestId('answer-panel');
    expect(panel.textContent).toContain('world');
  });
});
