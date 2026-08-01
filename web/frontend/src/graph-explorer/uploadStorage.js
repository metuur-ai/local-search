// Session persistence for an uploaded graph file.
//
// What is stored is the **raw upload text**, never the parsed or rendered graph:
// the force layout replaces `link.source`/`link.target` with node objects in the
// graph it is handed, so re-serializing live state would both persist layout
// mutations and go circular. Text also means no multi-megabyte re-stringify on
// every blend toggle, and a malformed stored value fails on restore exactly
// where a malformed upload does.
//
// `sessionStorage`, not `localStorage`: an uploaded file is the user's, and it
// should not outlive the tab it was opened in.

export const UPLOAD_STORAGE_KEY = 'local-search:graph-explorer:upload';

// Quota is counted in UTF-16 code units — roughly two bytes per character —
// against a typical 5 MB ceiling. A 2.7 MB file already needs ~5.4 MB.
export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;

export function fitsStorageBudget(text) {
  return String(text).length * 2 <= STORAGE_BUDGET_BYTES;
}

// A write failure degrades to in-memory-only; it never breaks the upload.
export function writeStoredUpload({ filename, text, blend }) {
  try {
    sessionStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify({ filename, text, blend }));
  } catch {
    /* Quota or a storage-denying browser: the upload lives on in memory. */
  }
}

export function clearStoredUpload() {
  try {
    sessionStorage.removeItem(UPLOAD_STORAGE_KEY);
  } catch {
    /* Nothing to recover from — there is no state to keep consistent. */
  }
}

// Absent, unparseable, or malformed all read as "no stored upload" rather than
// throwing on mount.
export function readStoredUpload() {
  let raw;
  try {
    raw = sessionStorage.getItem(UPLOAD_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.text !== 'string' || typeof entry.filename !== 'string') return null;
    return { filename: entry.filename, text: entry.text, blend: entry.blend === true };
  } catch {
    return null;
  }
}
