// Help modal: how to use the page, install, and docs links. Closes on the
// close button, backdrop click, or Escape. Ported from the former help modal.

import { useEffect } from 'preact/hooks';

export function HelpModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Help">
        <div class="modal-head">
          <h2>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
              <circle cx="5" cy="6" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="19" cy="7" r="1.5" fill="currentColor" stroke="none" />
              <path d="M12 12 L5 6 M12 12 L19 7" opacity="0.6" />
            </svg>
            Agent OS Graph
          </h2>
          <button type="button" class="icon-btn" aria-label="Close help" onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-lead">An interactive knowledge atlas of your registered repositories — files, tags, projects, and repos rendered as a force-directed graph you can search, filter, and inspect.</p>

          <div class="modal-section">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            How to use
          </div>
          <ol>
            <li><strong>Search</strong> files, tags, or projects from the top bar to spotlight matches.</li>
            <li><strong>Filter</strong> by file type, repo, directory, or tag — active filters show as removable chips.</li>
            <li><strong>Click a node</strong> to open the inspector with its properties and connections.</li>
            <li>Use the dock to <strong>zoom</strong>, <strong>fit to screen</strong>, or pause <strong>physics</strong>; toggle <strong>All labels</strong> to reveal every name.</li>
            <li><strong>Refresh from repos</strong> rebuilds the graph from selected repos, or <strong>Upload JSON</strong> to load your own export.</li>
          </ol>

          <div class="modal-section">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Install
          </div>
          <p>One command installs the CLI, the Claude skill, and this web UI:</p>
          <code class="block">curl -fsSL https://raw.githubusercontent.com/metuur-ai/local-search/main/install.sh | bash</code>
          <p>Then launch the UI (needs Node ≥ 18) and open the graph explorer:</p>
          <code class="block">local-search ui</code>
          <p>More install options (release bundle, prebuilt binary, build from source) on <a href="https://github.com/metuur-ai/local-search/blob/main/README.md#install" target="_blank" rel="noopener noreferrer">the install guide ↗</a>.</p>

          <div class="modal-section">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.247m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.247" />
            </svg>
            More documentation
          </div>
          <p>Full guide, search syntax, and configuration on <a href="https://github.com/metuur-ai/local-search/blob/main/user-guide/index.md" target="_blank" rel="noopener noreferrer">GitHub ↗</a>.</p>
        </div>
      </div>
    </div>
  );
}
