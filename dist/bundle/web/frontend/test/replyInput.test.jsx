import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { ReplyInput } from '../src/components/ReplyInput.jsx';

describe('ReplyInput 8.1 (R-8.1) — reply UI appears only when a question is asked', () => {
  it('renders the question text and a reply form when question is set', () => {
    render(<ReplyInput question="Which repo?" onReply={() => {}} />);
    expect(screen.getByTestId('reply-question').textContent).toContain('Which repo?');
    expect(screen.getByTestId('reply-textarea')).toBeTruthy();
    expect(screen.getByTestId('reply-send')).toBeTruthy();
  });

  it('renders nothing when question is falsy', () => {
    const { container } = render(<ReplyInput question="" onReply={() => {}} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('reply-textarea')).toBeNull();
  });

  it('calls onReply once with the typed text when Send is clicked', () => {
    const onReply = vi.fn();
    render(<ReplyInput question="Which repo?" onReply={onReply} />);
    const textarea = screen.getByTestId('reply-textarea');
    fireEvent.input(textarea, { target: { value: 'the main one' } });
    fireEvent.click(screen.getByTestId('reply-send'));
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledWith('the main one');
  });

  it('calls onReply on form submit as well', () => {
    const onReply = vi.fn();
    render(<ReplyInput question="Which repo?" onReply={onReply} />);
    const textarea = screen.getByTestId('reply-textarea');
    fireEvent.input(textarea, { target: { value: 'submitted' } });
    fireEvent.submit(screen.getByTestId('reply-form'));
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledWith('submitted');
  });

  it('does not call onReply for empty/whitespace text and disables Send', () => {
    const onReply = vi.fn();
    render(<ReplyInput question="Which repo?" onReply={onReply} />);
    const send = screen.getByTestId('reply-send');
    expect(send.disabled).toBe(true);

    const textarea = screen.getByTestId('reply-textarea');
    fireEvent.input(textarea, { target: { value: '   ' } });
    expect(screen.getByTestId('reply-send').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('reply-send'));
    expect(onReply).not.toHaveBeenCalled();
  });

  it('disables Send when disabled prop is true, even with text', () => {
    render(<ReplyInput question="Which repo?" onReply={() => {}} disabled={true} />);
    const textarea = screen.getByTestId('reply-textarea');
    fireEvent.input(textarea, { target: { value: 'ready' } });
    expect(screen.getByTestId('reply-send').disabled).toBe(true);
  });
});
