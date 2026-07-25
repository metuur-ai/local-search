import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RevealButton, revealLabel } from '../src/components/RevealButton.jsx';

describe('revealLabel', () => {
  it('names the file manager per platform', () => {
    expect(revealLabel('MacIntel')).toBe('Reveal in Finder');
    expect(revealLabel('Win32')).toBe('Show in File Explorer');
    expect(revealLabel('Linux x86_64')).toBe('Open containing folder');
    expect(revealLabel()).toBe('Open containing folder');
  });
});

describe('RevealButton', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when the source has no file to point at', () => {
    render(<RevealButton repo="squirrel" />);
    expect(screen.queryByTestId('reveal-btn')).toBeNull();
  });

  it('posts the repo + path to /api/reveal on click', async () => {
    render(<RevealButton repo="squirrel" path="docs/auth.md" fullpath="/r/docs/auth.md" />);
    fireEvent.click(screen.getByTestId('reveal-btn'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/reveal');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      repo: 'squirrel',
      path: 'docs/auth.md',
      fullpath: '/r/docs/auth.md',
    });
  });

  it('does not select the row it sits inside (click does not propagate)', async () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <RevealButton repo="squirrel" path="docs/auth.md" />
      </div>
    );
    fireEvent.click(screen.getByTestId('reveal-btn'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('surfaces a server failure on the button instead of failing silently', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'forbidden', message: 'outside every repo' }),
      })
    );
    render(<RevealButton repo="squirrel" path="../../etc/passwd" />);
    fireEvent.click(screen.getByTestId('reveal-btn'));

    await waitFor(() => {
      const btn = screen.getByTestId('reveal-btn');
      expect(btn.className).toContain('is-error');
      expect(btn.getAttribute('title')).toContain('outside every repo');
    });
  });
});
