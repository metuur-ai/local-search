// Single-view shell for the local-search-ui web UI. Orchestrates the full
// flow: pick repos, submit a query, open the SSE stream, and fan the streamed
// events out into the result regions. The layout mirrors the "Local-Search
// Console" design: a left search console (repos, query, facets, result stream)
// and a right tabbed inspector (AI answer / sources+provenance / graph). All
// backend behavior is unchanged — the facets below filter the streamed sources
// client-side; the strategy toggle is a display-only control.

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { fetchRepos, postQuery, openStream, postReply, postCancel } from './api.js';
import { RepoPicker, canSubmit } from './components/RepoPicker.jsx';
import { AnswerPanel } from './components/AnswerPanel.jsx';
import { GraphView } from './components/GraphView.jsx';
import { graphFromSources } from './components/graphElements.js';
import { loadHistory, saveRun, clearHistory } from './history.js';
import { loadCachedRepos, saveCachedRepos } from './repoCache.js';

// Shown in the site footer. Bump alongside the project version.
const APP_VERSION = '0.1.0';

// Compact relative timestamp ("2m ago") for the recent-searches list.
function relTime(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
import { SourcesPanel } from './components/SourcesPanel.jsx';
import { ProvenancePanel } from './components/ProvenancePanel.jsx';
import { ActivityFeed } from './components/ActivityFeed.jsx';
import { ReplyInput } from './components/ReplyInput.jsx';
import { ElapsedTimer } from './components/ElapsedTimer.jsx';
import { RankedSources } from './components/RankedSources.jsx';
import { SourceMap } from './components/SourceMap.jsx';
// Re-exported so existing importers of these two keep working; they live in their
// own module so components can use them without importing the app shell back.
export { sourceKey, normalizeTags } from './sourceIdentity.js';
import { sourceKey, normalizeTags } from './sourceIdentity.js';
import { RevealButton } from './components/RevealButton.jsx';
import RetrievalPath from './components/RetrievalPath.jsx';

// Derive a lowercase file extension from a source path ("code/db/index.go" -> "go").
function extOf(path) {
  if (typeof path !== 'string') return '';
  const base = path.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

// A run searches each selected repo separately, so `sources`/`provenance`
// arrive incrementally. Merge helpers keep the accumulated view stable.

// Append new source rows, de-duplicating by identity (later repos don't clobber
// earlier ones, and a re-emitted row is not duplicated). Tags are normalized to
// an array on the way in.
function mergeSources(prev, rows) {
  const seen = new Set(prev.map(sourceKey));
  const merged = prev.slice();
  for (const r of rows) {
    const k = sourceKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push({ ...r, tags: normalizeTags(r?.tags) });
  }
  return merged;
}

// Union the reached `scope` and `missing` lists across per-repo provenance events.
function mergeProvenance(prev, next) {
  const scope = [...new Set([...(prev.scope || []), ...(next.scope || [])])];
  const missingByRepo = new Map();
  for (const m of [...(prev.missing || []), ...(next.missing || [])]) {
    if (m && m.repo != null) missingByRepo.set(m.repo, m);
  }
  return { scope, missing: [...missingByRepo.values()] };
}

// Each follow-up produces a new answer "version". We keep only the most recent
// MAX_ANSWER_VERSIONS answers in the transcript; older exchanges roll off.
const MAX_ANSWER_VERSIONS = 3;

// Count the assistant answers (versions) currently in a flat turn list.
function assistantCount(turns) {
  return turns.reduce((n, t) => (t.role === 'assistant' ? n + 1 : n), 0);
}

// Trim a flat turn list to the last `max` answers, keeping the user question
// that each retained answer came with. Older exchanges are dropped.
function capTurns(turns, max = MAX_ANSWER_VERSIONS) {
  const answerIdx = [];
  turns.forEach((t, i) => {
    if (t.role === 'assistant') answerIdx.push(i);
  });
  if (answerIdx.length <= max) return turns;
  let start = answerIdx[answerIdx.length - max];
  // Keep the user question immediately preceding the oldest retained answer.
  if (start > 0 && turns[start - 1].role === 'user') start -= 1;
  return turns.slice(start);
}

export function App() {
  const [repos, setRepos] = useState([]);
  const [reposError, setReposError] = useState(null);
  // True only while a live fetch is in flight with nothing to show yet (first
  // ever load, or a manual refresh). A cached list renders immediately with no
  // spinner. `reposCachedAt` holds the timestamp the shown list was fetched.
  const [reposLoading, setReposLoading] = useState(false);
  const [reposCachedAt, setReposCachedAt] = useState(null);
  const [selected, setSelected] = useState([]);

  const [q, setQ] = useState('');
  // Search mode: 'ai' spawns claude for a synthesized answer (slow); 'graph'
  // hits the local-search graph DB directly (no model — returns in ~CLI time).
  const [searchMode, setSearchMode] = useState('ai');
  // The mode the in-flight/last run actually used, so result panes can adapt.
  const [ranMode, setRanMode] = useState('ai');
  const [sessionId, setSessionId] = useState(null);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  // When a query is rejected with 409 `session_active`, hold the blocking
  // session's id so the UI can offer to kill it (recover from an orphan).
  const [blockedBy, setBlockedBy] = useState(null);

  const [phase, setPhase] = useState('idle');
  const [model, setModel] = useState(null);
  const [activityEvents, setActivityEvents] = useState([]);
  const [answerMarkdown, setAnswerMarkdown] = useState('');
  // Threaded transcript of the AI conversation: the original answer plus each
  // follow-up the user sends and Claude's grounded reply. `answerMarkdown`
  // holds the latest answer (for copy/save); `turns` holds the whole thread.
  const [turns, setTurns] = useState([]);
  // Monotonic answer-version counter (survives roll-off) and the one-time
  // "oldest answer will roll off" warning gate; `rolloverText` holds the
  // pending follow-up while that alert is shown.
  const versionRef = useRef(0);
  const rolloverWarnedRef = useRef(false);
  const [rolloverText, setRolloverText] = useState(null);
  const [graph, setGraph] = useState(null);
  const [sources, setSources] = useState([]);
  const [provenance, setProvenance] = useState({});
  const [question, setQuestion] = useState('');
  const [done, setDone] = useState(false);

  // Display / client-side-only view state (does not touch the backend).
  const [showHelp, setShowHelp] = useState(false);
  // Gate shown when "New search" is pressed mid-run: confirm before discarding
  // the active search.
  const [showNewSearchConfirm, setShowNewSearchConfirm] = useState(false);
  const [inspectorTab, setInspectorTab] = useState('ai');
  const [fileFilter, setFileFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  // The selected source, held as its `sourceKey` rather than as a position. See
  // the `activeSource` resolution below for why position was wrong.
  const [activeSourceKey, setActiveSourceKey] = useState(null);

  // Last-5 completed runs, persisted in localStorage (client-side only).
  const [history, setHistory] = useState(() => loadHistory());
  const [showHistory, setShowHistory] = useState(false);
  const savedIdsRef = useRef(new Set());

  const streamRef = useRef(null);
  const searchInputRef = useRef(null);

  // Fetch the repo list live, persist it to the cache, and reconcile: any
  // selected repo that no longer exists is dropped so a stale pick can't be
  // searched (the CLI would reject an unregistered repo). A failed fetch keeps
  // the currently shown list rather than wiping it. Used by the refresh button
  // and by the first-ever load below.
  const refreshRepos = useCallback(() => {
    setReposLoading(true);
    setReposError(null);
    return fetchRepos()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setRepos(list);
        const ts = Date.now();
        saveCachedRepos(list, ts);
        setReposCachedAt(ts);
        const names = new Set(list.map((r) => r.name));
        setSelected((prev) => prev.filter((n) => names.has(n)));
      })
      .catch((err) => {
        setReposError(err?.message ?? String(err));
      })
      .finally(() => setReposLoading(false));
  }, []);

  // On mount: render the cached list instantly if present (no live call — the
  // CLI re-indexes on every `json repos`, which is the slow part the user sees).
  // Only the first-ever load, with no cache, pays for a live fetch + spinner.
  useEffect(() => {
    const cached = loadCachedRepos();
    if (cached) {
      setRepos(cached.repos);
      setReposCachedAt(cached.ts);
    } else {
      refreshRepos();
    }
    return () => {
      if (streamRef.current) streamRef.current.close();
    };
  }, [refreshRepos]);

  const onToggle = useCallback((name) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }, []);

  const allSelected = repos.length > 0 && selected.length === repos.length;

  // Union the given repo names into the selection — used by the picker's
  // filter-aware "select matching" action instead of a blind select-all.
  const onSelectMatching = useCallback((names) => {
    setSelected((prev) => [...new Set([...prev, ...names])]);
  }, []);
  const onClearRepos = useCallback(() => setSelected([]), []);

  const appendActivity = useCallback((type, data) => {
    setActivityEvents((prev) => [...prev, { type, data }]);
  }, []);

  const closeStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }, []);

  // Stream event handlers, shared by the initial query and any follow-up turn so
  // a resumed turn continues into the same UI state. `mode` tailors the `done`
  // event (graph runs surface sources instead of an answer pane).
  const buildHandlers = useCallback(
    (mode) => ({
      status: (d) => {
        if (d.phase) setPhase(d.phase);
        if (d.model) setModel(d.model);
      },
      activity: (d) => appendActivity('activity', d),
      assistant: (d) => appendActivity('assistant', d),
      question: (d) => {
        setQuestion(d.text || '');
        appendActivity('question', d);
        // The turn is paused awaiting the user's clarification — stop the
        // "working" spinner so the UI doesn't look like it's still searching.
        setRunning(false);
      },
      // The real CLI scopes one repo per call, so a run emits one `sources`
      // and one `provenance` event PER searched repo — accumulate rather than
      // replace so multi-repo results and reached-scope both stay complete.
      sources: (rows) =>
        setSources((prev) => mergeSources(prev, Array.isArray(rows) ? rows : [])),
      provenance: (d) => setProvenance((prev) => mergeProvenance(prev, d || {})),
      graph: (d) => setGraph(d || null),
      answer: (d) => {
        const md = d.markdown || '';
        setAnswerMarkdown(md);
        // Append this answer as a versioned assistant turn, capping the
        // transcript to the last MAX_ANSWER_VERSIONS answers (older roll off).
        versionRef.current += 1;
        const version = versionRef.current;
        setTurns((prev) => capTurns([...prev, { role: 'assistant', markdown: md, version }]));
        setRunning(false);
        setDone(true);
        setInspectorTab('ai');
        closeStream();
      },
      reply: (d) => appendActivity('reply', d),
      error: (d) => {
        setErrorMsg(d.message || 'stream error');
        setRunning(false);
        closeStream();
      },
      done: (d) => {
        setRunning(false);
        setDone(true);
        if (d && d.cancelled) setCancelled(true);
        // No-AI runs produce no answer pane — surface the sources instead.
        if (mode === 'graph' && !(d && d.cancelled)) setInspectorTab('sources');
        closeStream();
      },
    }),
    [appendActivity, closeStream]
  );

  // Clear all run-scoped result state (answer, sources, provenance, graph,
  // activity, error/flags) back to a blank slate. Used by both a fresh submit
  // and the "New search" action. Leaves the query, selected repos, session, and
  // saved history untouched — callers decide what else to clear.
  const resetRunState = useCallback(() => {
    setActivityEvents([]);
    setAnswerMarkdown('');
    setTurns([]);
    versionRef.current = 0;
    rolloverWarnedRef.current = false;
    setRolloverText(null);
    setGraph(null);
    setSources([]);
    setProvenance({});
    setQuestion('');
    setErrorMsg(null);
    setBlockedBy(null);
    setCancelled(false);
    setDone(false);
    setModel(null);
    setPhase('idle');
    setActiveSourceKey(null);
  }, []);

  const onSubmit = useCallback(async () => {
    if (!canSubmit(selected) || running) return;

    // Reset run-scoped state for a fresh query.
    resetRunState();

    const mode = searchMode;
    setRanMode(mode);

    let id;
    try {
      const resp = await postQuery({ q, repos: selected, mode });
      id = resp.sessionId;
    } catch (err) {
      setErrorMsg(err?.message ?? String(err));
      // A 409 means another (possibly orphaned) session is holding the slot —
      // remember its id so the user can kill it and retry.
      if (err?.code === 'session_active' && err?.activeSessionId) {
        setBlockedBy(err.activeSessionId);
      }
      return;
    }

    setSessionId(id);
    setRunning(true);
    setStartedAt(Date.now());

    streamRef.current = openStream(id, buildHandlers(mode));
  }, [selected, running, q, searchMode, buildHandlers, resetRunState]);

  const onReply = useCallback(
    (text) => {
      if (!sessionId) return;
      postReply(sessionId, text).catch((err) =>
        setErrorMsg(err?.message ?? String(err))
      );
      appendActivity('reply', { text });
      setQuestion('');
      setRunning(true);
      setDone(false);
      // Allow the resumed turn's updated answer to replace the saved entry.
      savedIdsRef.current.delete(sessionId);
    },
    [sessionId, appendActivity]
  );

  // User-initiated follow-up ("comment the result with Claude"): resume the same
  // Claude session with a new prompt and stream its grounded reply into the
  // transcript. The backend closed the stream after the last answer, so we
  // reconnect first (handleStream holds a `done` session's stream open), then reply.
  const runFollowUp = useCallback(
    (t) => {
      setTurns((prev) => [...prev, { role: 'user', markdown: t }]);
      appendActivity('reply', { text: t });
      setQuestion('');
      setRunning(true);
      setDone(false);
      // Allow the resumed turn's updated answer to replace the saved entry.
      savedIdsRef.current.delete(sessionId);
      streamRef.current = openStream(sessionId, buildHandlers(ranMode));
      postReply(sessionId, t).catch((err) => {
        setErrorMsg(err?.message ?? String(err));
        setRunning(false);
        setDone(true);
        closeStream();
      });
    },
    [sessionId, ranMode, appendActivity, buildHandlers, closeStream]
  );

  // Gate the follow-up: the first time a new answer would push past the
  // 3-version window, surface an alert explaining the oldest answer rolls off.
  // Once acknowledged we don't ask again for this run.
  const onFollowUp = useCallback(
    (text) => {
      const t = (text || '').trim();
      if (!sessionId || !t || running) return;
      if (assistantCount(turns) >= MAX_ANSWER_VERSIONS && !rolloverWarnedRef.current) {
        setRolloverText(t);
        return;
      }
      runFollowUp(t);
    },
    [sessionId, running, turns, runFollowUp]
  );

  // Rollover alert actions: proceed (and never warn again this run) or dismiss.
  const confirmRollover = useCallback(() => {
    rolloverWarnedRef.current = true;
    const t = rolloverText;
    setRolloverText(null);
    if (t) runFollowUp(t);
  }, [rolloverText, runFollowUp]);

  const cancelRollover = useCallback(() => setRolloverText(null), []);

  const onCancel = useCallback(() => {
    if (!sessionId) return;
    // Stop the UI immediately rather than waiting on the SSE `done` round-trip —
    // if that frame is delayed or dropped the button would otherwise stay stuck.
    // The backend request below still kills the underlying process.
    setRunning(false);
    setCancelled(true);
    setDone(true);
    closeStream();
    postCancel(sessionId).catch((err) =>
      setErrorMsg(err?.message ?? String(err))
    );
  }, [sessionId, closeStream]);

  // Kill the session reported by a 409 `session_active` (an orphan blocking new
  // queries), then clear the error so the user can retry immediately.
  const onKillBlocking = useCallback(async () => {
    if (!blockedBy) return;
    try {
      await postCancel(blockedBy);
    } catch (err) {
      // A 404 here means it's already gone — treat that as success.
      if (!/unknown session/i.test(err?.message ?? '')) {
        setErrorMsg(err?.message ?? String(err));
        return;
      }
    }
    setBlockedBy(null);
    setErrorMsg(null);
  }, [blockedBy]);

  // Wipe the current run back to a blank console and refocus the query box.
  // Kills any in-flight session (best-effort) so it isn't orphaned, but keeps
  // the selected repos and saved history so the user can re-query.
  const performNewSearch = useCallback(() => {
    closeStream();
    if (sessionId) postCancel(sessionId).catch(() => {});
    resetRunState();
    setQ('');
    setSessionId(null);
    setRunning(false);
    setStartedAt(null);
    setShowHistory(false);
    setInspectorTab('ai');
    searchInputRef.current?.focus();
  }, [closeStream, sessionId, resetRunState]);

  // "New search" entry point: if a run is still in progress, confirm before
  // discarding it (the confirm cancels the active search); otherwise clear now.
  const newSearch = useCallback(() => {
    if (running) {
      setShowNewSearchConfirm(true);
      return;
    }
    performNewSearch();
  }, [running, performNewSearch]);

  const confirmNewSearch = useCallback(() => {
    setShowNewSearchConfirm(false);
    performNewSearch();
  }, [performNewSearch]);

  const cancelNewSearchConfirm = useCallback(() => setShowNewSearchConfirm(false), []);

  const currentActivity = (() => {
    for (let i = activityEvents.length - 1; i >= 0; i--) {
      const ev = activityEvents[i];
      if (ev.type === 'activity') return ev.data.command;
    }
    return null;
  })();

  const submitDisabled = !canSubmit(selected) || running;

  // "New search" is only meaningful once a run is in progress or has produced
  // something to clear — hide it on the pristine, first-load console.
  const hasActivity =
    running ||
    done ||
    !!sessionId ||
    !!q.trim() ||
    !!errorMsg ||
    sources.length > 0 ||
    activityEvents.length > 0;

  // Derive the always-visible run status shown in the topbar pill.
  const status = errorMsg
    ? { state: 'error', label: 'error' }
    : running
      ? { state: 'running', label: phase || 'working' }
      : cancelled
        ? { state: 'error', label: 'cancelled' }
        : done
          ? { state: 'done', label: 'done' }
          : { state: 'idle', label: 'idle' };

  // Facets derived from the streamed sources (client-side only).
  const fileFacets = useMemo(() => {
    const counts = {};
    for (const s of sources) {
      const e = extOf(s.path);
      if (e) counts[e] = (counts[e] || 0) + 1;
    }
    return counts;
  }, [sources]);

  const tagFacets = useMemo(() => {
    const counts = {};
    for (const s of sources) {
      for (const t of s.tags || []) counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [sources]);

  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      if (fileFilter !== 'all' && extOf(s.path) !== fileFilter) return false;
      if (tagFilter !== 'all' && !(s.tags || []).includes(tagFilter)) return false;
      return true;
    });
  }, [sources, fileFilter, tagFilter]);

  const filterSummary = (() => {
    const items = [];
    if (repos.length > 0) {
      items.push(allSelected ? 'all-repos' : `${selected.length} repo(s)`);
    }
    if (fileFilter !== 'all') items.push(`*.${fileFilter}`);
    if (tagFilter !== 'all') items.push(`#${tagFilter}`);
    return items.length ? items.join(' → ') : 'None';
  })();

  // Resolved by identity, against the UNFILTERED `sources`. This used to be a
  // positional index into `filteredSources`, which broke two ways. The Source Map
  // is built from unfiltered `sources` (D8), so a leaf's position is not its
  // position in `filteredSources` — with a filter active a leaf would open a
  // different document, or none. And changing the filter after selecting silently
  // re-pointed this block at whatever row landed on that index next.
  const activeSource =
    activeSourceKey == null
      ? null
      : sources.find((s) => sourceKey(s) === activeSourceKey) ?? null;

  // One selection path for the result cards and the Source Map leaves, so a leaf
  // and its list row always land on the same detail block (R-3.3, R-3.6).
  const selectSource = useCallback((row) => {
    setActiveSourceKey(sourceKey(row));
    setInspectorTab('sources');
  }, []);

  // The Neighborhood Map uses the explicit `graph` event when Claude ran
  // `json related`; otherwise it falls back to a star synthesized from the
  // retrieved sources so the map always reflects what was found.
  const graphForView = useMemo(
    () => graph ?? graphFromSources(sources),
    [graph, sources]
  );

  // Top 10 tags across the retrieved sources, by frequency. Drives the "Top
  // Tags" inspector tab — a quick read on what themes the results cluster on.
  // Ties break alphabetically so the order is stable across renders.
  const topTags = useMemo(() => {
    const counts = new Map();
    for (const s of sources) {
      for (const t of s?.tags || []) {
        if (t == null || t === '') continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  }, [sources]);

  // Persist a completed, successful run to local history (once per session id).
  useEffect(() => {
    if (!done || !sessionId || cancelled || errorMsg) return;
    if (!answerMarkdown.trim()) return;
    if (savedIdsRef.current.has(sessionId)) return;
    savedIdsRef.current.add(sessionId);
    setHistory(
      saveRun({
        id: sessionId,
        ts: Date.now(),
        query: q,
        repos: selected,
        answerMarkdown,
        sources,
        provenance,
        graph,
      })
    );
  }, [done, sessionId, cancelled, errorMsg, answerMarkdown, q, selected, sources, provenance, graph]);

  // Re-open a saved run into all panes without touching the backend.
  const restoreRun = useCallback(
    (run) => {
      closeStream();
      setRunning(false);
      setCancelled(false);
      setErrorMsg(null);
      setActivityEvents([]);
      setQuestion('');
      setQ(run.query || '');
      setSelected(Array.isArray(run.repos) ? run.repos : []);
      setAnswerMarkdown(run.answerMarkdown || '');
      // Restored history is view-only: seed the transcript from the saved answer
      // but null the live session so follow-up (which resumes a live session) is
      // disabled until a fresh query runs.
      setTurns(
        run.answerMarkdown ? [{ role: 'assistant', markdown: run.answerMarkdown, version: 1 }] : []
      );
      versionRef.current = run.answerMarkdown ? 1 : 0;
      rolloverWarnedRef.current = false;
      setRolloverText(null);
      setSessionId(null);
      setSources(mergeSources([], Array.isArray(run.sources) ? run.sources : []));
      setProvenance(run.provenance || {});
      setGraph(run.graph || null);
      setDone(true);
      setActiveSourceKey(null);
      setStartedAt(null);
      setInspectorTab('ai');
      setShowHistory(false);
    },
    [closeStream]
  );

  const onClearHistory = useCallback(() => {
    savedIdsRef.current = new Set();
    setHistory(clearHistory());
  }, []);

  // ⌘/Ctrl+Enter (or Enter, since this is a single-line search field) submits.
  const onQueryKeyDown = (e) => {
    if (e.key === 'Enter' && !submitDisabled) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div class="app">
      {/* ------------------------------------------------------------ Header */}
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            <i class="fa-solid fa-wand-magic-sparkles" />
          </span>
          <span class="brand-text">
            <span class="brand-title-row">
              <h1 class="brand-title">local-search</h1>
              <span class="brand-badge">explainable retrieval</span>
              <a class="brand-nav-link" href="/graph-explorer.html">Agent OS Graph →</a>
            </span>
            <span class="brand-sub">grounded retrieval over your local repositories</span>
          </span>
        </div>

        <div class="topbar-meta">
          {hasActivity && (
            <button
              type="button"
              class="new-search-btn"
              title="Clear results and start a new search"
              data-testid="new-search"
              onClick={newSearch}
            >
              <i class="fa-solid fa-plus" /> New search
            </button>
          )}
          {model && (
            <span class="app-model" data-testid="app-model">
              <i class="fa-solid fa-microchip" /> {model}
            </span>
          )}
          <span class="status-pill" data-state={status.state} data-testid="run-status">
            <span class="status-dot" aria-hidden="true" />
            {status.label}
          </span>
          <button
            type="button"
            class="help-btn"
            title="How to use this page"
            aria-label="Help"
            data-testid="help-open"
            onClick={() => setShowHelp(true)}
          >
            <i class="fa-solid fa-circle-question" />
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------- Workspace */}
      <div class="workspace">
        {/* ==================================== Left: search console + stream */}
        <section class="console">
          <div class="console-controls">
            {/* Search input bar */}
            <div class="search-bar">
              <i class="fa-solid fa-magnifying-glass search-bar-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                class="search-input"
                placeholder="Ask a question about your code and docs…"
                value={q}
                onInput={(e) => setQ(e.target.value)}
                onKeyDown={onQueryKeyDown}
                data-testid="query-box"
              />
              {q && (
                <button
                  type="button"
                  class="search-clear"
                  title="Clear query"
                  onClick={() => setQ('')}
                >
                  <i class="fa-solid fa-circle-xmark" />
                </button>
              )}
            </div>

            {/* Repository multi-selector */}
            <div class="facet-block">
              <div class="facet-head">
                <span class="facet-label">
                  <i class="fa-solid fa-cubes" /> Target Repositories
                </span>
                <span class="facet-head-actions">
                  {selected.length > 0 && (
                    <span class="facet-allcount" data-testid="repo-selected-count">
                      {selected.length}/{repos.length} selected
                    </span>
                  )}
                  <button
                    type="button"
                    class="repo-refresh"
                    data-testid="repo-refresh"
                    title={
                      reposCachedAt
                        ? `Repositories cached ${relTime(reposCachedAt)}. Refresh from disk.`
                        : 'Refresh repositories from disk'
                    }
                    disabled={reposLoading}
                    onClick={refreshRepos}
                  >
                    <i
                      class={`fa-solid fa-arrows-rotate${reposLoading ? ' fa-spin' : ''}`}
                      aria-hidden="true"
                    />
                    {reposLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </span>
              </div>
              <RepoPicker
                repos={repos}
                selected={selected}
                onToggle={onToggle}
                onSelectMatching={onSelectMatching}
                onClear={onClearRepos}
                aiMode={searchMode === 'ai'}
                error={reposError}
                loading={reposLoading}
              />
            </div>

            {/* File typologies */}
            <div class="facet-grid">
              <div class="facet-block">
                <span class="facet-label">
                  <i class="fa-solid fa-file" /> File Typologies
                </span>
                <div class="segmented" role="group" aria-label="File type filter">
                  <button
                    type="button"
                    class={`segmented-btn${fileFilter === 'all' ? ' is-active' : ''}`}
                    onClick={() => setFileFilter('all')}
                  >
                    All ({sources.length})
                  </button>
                  {Object.entries(fileFacets).map(([ext, count]) => (
                    <button
                      type="button"
                      key={ext}
                      class={`segmented-btn${fileFilter === ext ? ' is-active' : ''}`}
                      onClick={() => setFileFilter(fileFilter === ext ? 'all' : ext)}
                    >
                      {ext.toUpperCase()} ({count})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Hot tag facets */}
            {tagFacets.length > 0 && (
              <div class="facet-block">
                <span class="facet-label">
                  <i class="fa-solid fa-tags" /> Hot Tag Facets
                </span>
                <div class="tag-ribbon">
                  <button
                    type="button"
                    class={`tag-pill${tagFilter === 'all' ? ' is-active' : ''}`}
                    onClick={() => setTagFilter('all')}
                  >
                    All Tags
                  </button>
                  {tagFacets.map(([tag, count]) => (
                    <button
                      type="button"
                      key={tag}
                      class={`tag-pill${tagFilter === tag ? ' is-active' : ''}${
                        count >= 4 ? ' dense-hi' : count === 3 ? ' dense-mid' : ''
                      }`}
                      onClick={() => setTagFilter(tagFilter === tag ? 'all' : tag)}
                    >
                      #{tag} <span class="tag-count">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search mode: AI answer vs. direct graph DB (no model) */}
            <div class="facet-block">
              <span class="facet-label">
                <i class="fa-solid fa-bolt" /> Search Mode
              </span>
              <div class="segmented" role="group" aria-label="Search mode">
                <button
                  type="button"
                  class={`segmented-btn${searchMode === 'ai' ? ' is-active' : ''}`}
                  onClick={() => setSearchMode('ai')}
                  disabled={running}
                  data-testid="mode-ai"
                >
                  <i class="fa-solid fa-wand-magic-sparkles" /> AI Answer
                </button>
                <button
                  type="button"
                  class={`segmented-btn${searchMode === 'graph' ? ' is-active' : ''}`}
                  onClick={() => setSearchMode('graph')}
                  disabled={running}
                  data-testid="mode-graph"
                >
                  <i class="fa-solid fa-bolt" /> Graph only · fast
                </button>
              </div>
              <p class="facet-hint">
                {searchMode === 'graph'
                  ? 'Direct graph-DB lookup — no model call, returns in ~a second.'
                  : 'Full AI synthesis over retrieved sources (slower — spawns the model).'}
              </p>
            </div>

            {/* Actions + metrics */}
            <div class="console-actions">
              <button
                type="button"
                class="btn-primary"
                disabled={submitDisabled}
                onClick={onSubmit}
              >
                <i class={`fa-solid ${searchMode === 'graph' ? 'fa-bolt' : 'fa-magnifying-glass'}`} />
                {searchMode === 'graph' ? ' Search (no AI)' : ' Search'}
              </button>
              {running && (
                <button
                  type="button"
                  class="btn-ghost"
                  data-testid="query-cancel"
                  onClick={onCancel}
                >
                  Cancel
                </button>
              )}
              {startedAt != null && (
                <ElapsedTimer
                  startedAt={startedAt}
                  running={running}
                  currentActivity={currentActivity}
                />
              )}
            </div>

            <div class="metrics-bar">
              <span>
                Active Filters: <strong>{filterSummary}</strong>
              </span>
              <span>
                Found <strong>{filteredSources.length}</strong> source
                {filteredSources.length === 1 ? '' : 's'}
              </span>
            </div>

            {cancelled && (
              <p class="console-note" data-testid="query-cancelled">Cancelled.</p>
            )}
            {errorMsg && (
              <p class="console-error" data-testid="query-error">{errorMsg}</p>
            )}
            {blockedBy && (
              <div class="blocked-session" data-testid="blocked-session">
                <span class="blocked-session-info">
                  <i class="fa-solid fa-triangle-exclamation" /> A previous
                  session is still holding the slot
                  <code class="blocked-session-id">{blockedBy}</code>
                </span>
                <button
                  type="button"
                  class="btn-danger"
                  data-testid="kill-session"
                  onClick={onKillBlocking}
                >
                  <i class="fa-solid fa-stop" /> Kill active session
                </button>
              </div>
            )}

            {/* Recent searches — last 5, persisted client-side */}
            {history.length > 0 && (
              <div class="history-block" data-testid="history">
                <button
                  type="button"
                  class="history-toggle"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-expanded={showHistory}
                >
                  <i class={`fa-solid ${showHistory ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
                  <i class="fa-solid fa-clock-rotate-left" /> Recent searches
                  <span class="history-count">{history.length}</span>
                </button>
                {showHistory && (
                  <ul class="history-list">
                    {history.map((run) => (
                      <li key={run.id}>
                        <button
                          type="button"
                          class="history-item"
                          onClick={() => restoreRun(run)}
                          title={`Reopen: ${run.query || '(no query)'}`}
                        >
                          <span class="history-q">{run.query || '(no query)'}</span>
                          <span class="history-meta">
                            <span class="history-chip">
                              <i class="fa-solid fa-cubes" />{' '}
                              {Array.isArray(run.repos) ? run.repos.length : 0}
                            </span>
                            <span class="history-chip">
                              <i class="fa-solid fa-file-lines" />{' '}
                              {Array.isArray(run.sources) ? run.sources.length : 0}
                            </span>
                            <span class="history-time">{relTime(run.ts)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                    <li>
                      <button type="button" class="history-clear" onClick={onClearHistory}>
                        <i class="fa-solid fa-trash-can" /> Clear history
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            )}

            <ReplyInput question={question} onReply={onReply} />
          </div>

          {/* Result stream — the streamed sources rendered as ranked cards */}
          <div class="result-stream" data-testid="result-stream">
            {filteredSources.length === 0 ? (
              <div class="stream-empty">
                <i class="fa-solid fa-magnifying-glass-minus" />
                <p>
                  {running
                    ? 'Retrieving sources…'
                    : 'No sources yet — pick repositories, ask a question, and results will stream here.'}
                </p>
              </div>
            ) : (
              filteredSources.map((src, i) => {
                const label = src.title || src.name || '(untitled)';
                const ext = extOf(src.path);
                const isActive = sourceKey(src) === activeSourceKey;
                const select = () => selectSource(src);
                return (
                  // A div, not a button: the card nests its own reveal action and
                  // a button inside a button is invalid. role/tabIndex/onKeyDown
                  // restore the keyboard and a11y behaviour a <button> gave us.
                  <div
                    role="button"
                    tabIndex={0}
                    key={`${src.path || label}-${i}`}
                    class={`result-card${isActive ? ' is-active' : ''}`}
                    onClick={select}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select();
                      }
                    }}
                  >
                    <div class="result-card-top">
                      <span class="result-path" title={src.path}>
                        {ext === 'md' ? (
                          <i class="fa-brands fa-markdown" />
                        ) : ext === 'go' ? (
                          <i class="fa-brands fa-golang" />
                        ) : (
                          <i class="fa-solid fa-file-lines" />
                        )}
                        {src.path || label}
                      </span>
                      {src.repo != null && <span class="result-repo">{src.repo}</span>}
                      <RevealButton
                        repo={src.repo}
                        path={src.path}
                        fullpath={src.fullpath}
                        compact
                      />
                    </div>
                    <h4 class="result-title">{label}</h4>
                    <div class="result-card-bottom">
                      <div class="result-tags">
                        {(src.tags || []).map((t) => (
                          <span class="result-tag" key={t}>#{t}</span>
                        ))}
                      </div>
                      {src.relevance != null && (
                        <span class="result-score">
                          <i class="fa-solid fa-chart-line" /> {src.relevance}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Live activity feed (kept as a real feature) */}
          <section class="console-activity" data-testid="region-activity">
            <ActivityFeed events={activityEvents} phase={phase} running={running} />
          </section>
        </section>

        {/* ============================================= Right: tab inspector */}
        <aside class="inspector">
          <div class="inspector-tabs">
            <div class="inspector-tablist">
              <button
                type="button"
                class={`inspector-tab${inspectorTab === 'ai' ? ' is-active' : ''}`}
                onClick={() => setInspectorTab('ai')}
              >
                <i class="fa-solid fa-wand-magic-sparkles" /> AI Answer
              </button>
              <button
                type="button"
                class={`inspector-tab${inspectorTab === 'sources' ? ' is-active' : ''}`}
                onClick={() => setInspectorTab('sources')}
              >
                <i class="fa-solid fa-file-code" /> Sources &amp; Provenance
              </button>
              <button
                type="button"
                class={`inspector-tab${inspectorTab === 'graph' ? ' is-active' : ''}`}
                onClick={() => setInspectorTab('graph')}
              >
                <i class="fa-solid fa-circle-nodes" /> Neighborhood Map
              </button>
              <button
                type="button"
                class={`inspector-tab${inspectorTab === 'sourcemap' ? ' is-active' : ''}`}
                onClick={() => setInspectorTab('sourcemap')}
              >
                <i class="fa-solid fa-folder-tree" /> Source Map
              </button>
              <button
                type="button"
                class={`inspector-tab${inspectorTab === 'tags' ? ' is-active' : ''}`}
                onClick={() => setInspectorTab('tags')}
              >
                <i class="fa-solid fa-tags" /> Top Tags
              </button>
            </div>
            <span class="inspector-ext">
              {inspectorTab === 'ai'
                ? 'AI Synthesis'
                : inspectorTab === 'sources'
                  ? `${sources.length} sources`
                  : inspectorTab === 'sourcemap'
                    ? `${sources.length} sources`
                    : inspectorTab === 'tags'
                      ? `${topTags.length} tags`
                      : 'Graph'}
            </span>
          </div>

          {/* Pane 1: AI answer */}
          <div
            class="inspector-pane"
            data-testid="region-answer"
            hidden={inspectorTab !== 'ai'}
          >
            {ranMode === 'graph' ? (
              running ? (
                <div class="ai-context" data-testid="ai-searching">
                  <span class="ai-search-spinner" aria-hidden="true" />
                  <div>
                    <h3>Searching the graph DB…</h3>
                    <p>
                      Looking up matches directly in local-search — no model
                      call. Results will stream into{' '}
                      <strong>Sources &amp; Provenance</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <div class="ai-context" data-testid="ai-skipped">
                  <i class="fa-solid fa-bolt" />
                  <div>
                    <h3>No-AI mode</h3>
                    <p>
                      Results came straight from the local-search graph DB — no
                      model call. Open <strong>Sources &amp; Provenance</strong> to
                      view the matches.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div class="ai-context">
                <i class="fa-solid fa-brain" />
                <div>
                  <h3>Answer synthesis</h3>
                  <p>
                    Grounded over the sources retrieved for your query across the
                    selected repositories.
                  </p>
                </div>
              </div>
            )}
            {ranMode !== 'graph' && (
              <AnswerPanel
                markdown={answerMarkdown}
                turns={turns}
                running={running}
                done={done}
                phase={phase}
                activity={currentActivity}
                onFollowUp={onFollowUp}
                canFollowUp={
                  ranMode !== 'graph' &&
                  !!sessionId &&
                  !running &&
                  turns.some((t) => t.role === 'assistant')
                }
              />
            )}
          </div>

          {/* Pane 2: sources + provenance (file-reader analog) */}
          <div
            class="inspector-pane"
            data-testid="region-sources"
            hidden={inspectorTab !== 'sources'}
          >
            {activeSource && (
              <div class="source-detail">
                <div class="source-detail-path">
                  <span>{activeSource.path || activeSource.title || activeSource.name}</span>
                  {activeSource.repo != null && (
                    <span class="source-detail-repo">{activeSource.repo}</span>
                  )}
                </div>
                <RevealButton
                  repo={activeSource.repo}
                  path={activeSource.path}
                  fullpath={activeSource.fullpath}
                />
                <h2 class="source-detail-title">
                  {activeSource.title || activeSource.name || '(untitled)'}
                </h2>
                {(activeSource.tags || []).length > 0 && (
                  <div class="source-detail-tags">
                    {activeSource.tags.map((t) => (
                      <span class="result-tag" key={t}>#{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <SourcesPanel sources={sources} />
            <RankedSources sources={sources} />
            <div data-testid="region-provenance">
              <ProvenancePanel provenance={provenance} selected={selected} />
              <RetrievalPath />
            </div>
          </div>

          {/* Pane 3: knowledge graph */}
          <div
            class="inspector-pane inspector-pane-graph"
            data-testid="region-graph"
            hidden={inspectorTab !== 'graph'}
          >
            <div class="graph-intro">
              <h3>
                <i class="fa-solid fa-diagram-project" /> Knowledge graph
              </h3>
              <p>Retrieved sources are outlined; node size tracks relevance.</p>
              {/* Two tabs are named "…Map", so each states its own claim rather
                  than leaving the user to guess which answers their question
                  (story 1.5; HLD non-goal amended 2026-07-27).

                  Says nothing about what the EDGES mean, on purpose. This pane has
                  two modes: with an explicit `graph` event from `json related` it
                  does carry document-to-document links, but the fallback
                  `graphFromSources` is a pure star of query→document links only
                  (graphElements.js:74-96). Copy claiming the map "shows which
                  documents relate to each other" — as this line first did — is
                  false in the fallback mode, and is exactly the semantic overclaim
                  the honesty doctrine forbids (constraint 7). */}
              <p class="graph-intro-contrast">
                This map answers what your query pulled in, and how strongly. For
                where those documents live on disk, see <strong>Source Map</strong>.
              </p>
            </div>
            <div class="graph-frame">
              <GraphView
                graph={graphForView}
                sources={sources}
                active={inspectorTab === 'graph'}
              />
            </div>
          </div>

          {/* Pane 4: source map — where the retrieved documents came from */}
          <div
            class="inspector-pane"
            data-testid="region-source-map"
            hidden={inspectorTab !== 'sourcemap'}
          >
            <div class="graph-intro">
              <h3>
                <i class="fa-solid fa-folder-tree" /> Source map
              </h3>
              {/* Deliberately does NOT repeat the counted scope — the pane's own
                  header states it, and that is the tested copy (R-2.12). */}
              <p>Where the retrieved documents came from.</p>
            </div>
            <SourceMap
              sources={sources}
              active={inspectorTab === 'sourcemap'}
              onSelectSource={selectSource}
            />
          </div>

          {/* Pane 5: top tags across the retrieved sources */}
          <div
            class="inspector-pane"
            data-testid="region-tags"
            hidden={inspectorTab !== 'tags'}
          >
            <div class="graph-intro">
              <h3>
                <i class="fa-solid fa-tags" /> Top tags
              </h3>
              <p>The 10 most frequent tags across the retrieved sources.</p>
            </div>
            {topTags.length === 0 ? (
              <p class="tag-rank-empty" data-testid="tag-rank-empty">
                No tags on the current results.
              </p>
            ) : (
              <ol class="tag-rank" data-testid="tag-rank">
                {topTags.map(({ tag, count }) => (
                  <li class="tag-rank-item" key={tag}>
                    <button
                      type="button"
                      class="tag-rank-label"
                      onClick={() => {
                        setTagFilter(tag);
                        setInspectorTab('sources');
                      }}
                      title={`Filter sources by #${tag}`}
                    >
                      #{tag}
                    </button>
                    <span
                      class="tag-rank-bar"
                      style={{ width: `${(count / topTags[0].count) * 100}%` }}
                    />
                    <span class="tag-rank-count">{count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div class="inspector-footer">
            <span>local-search client console</span>
            <span>{model || 'grounded retrieval'}</span>
          </div>
        </aside>
      </div>

      {/* ---------------------------------------------------------- Site footer */}
      <footer class="app-footer" data-testid="app-footer">
        <span class="app-footer-credit">
          © 2026 local-search v{APP_VERSION} · made by{' '}
          <a href="https://x.com/javierhbr" target="_blank" rel="noopener noreferrer">
            @javierhbr
          </a>
        </span>
        <span class="app-footer-links">
          <a
            href="https://github.com/javierhbr"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            aria-label="GitHub"
          >
            <i class="fa-brands fa-github" />
          </a>
          <a
            href="https://x.com/javierhbr"
            target="_blank"
            rel="noopener noreferrer"
            title="X"
            aria-label="X"
          >
            <i class="fa-brands fa-x-twitter" />
          </a>
          <a
            class="app-footer-coffee"
            href="https://www.buymeacoffee.com/javierhbr"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i class="fa-solid fa-mug-hot" /> Buy me a coffee
          </a>
        </span>
      </footer>

      {/* Help modal — how to use this page, install, and docs link. */}
      {showHelp &&
        createPortal(
          <div
            class="alert-modal"
            data-testid="help-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowHelp(false);
            }}
          >
            <div class="help-panel" role="dialog" aria-modal="true" aria-label="Help">
              <div class="help-head">
                <h3 class="help-title">
                  <i class="fa-solid fa-wand-magic-sparkles" /> Local-Search Console
                </h3>
                <button
                  type="button"
                  class="help-close"
                  aria-label="Close help"
                  data-testid="help-close"
                  onClick={() => setShowHelp(false)}
                >
                  <i class="fa-solid fa-xmark" />
                </button>
              </div>
              <div class="help-body">
                <p class="help-lead">
                  Grounded retrieval over your local repositories — pick repos, ask a
                  question, and watch sources, an AI answer, and a knowledge graph
                  stream in.
                </p>

                <h4 class="help-section">
                  <i class="fa-solid fa-list-ol" /> How to use
                </h4>
                <ol class="help-list">
                  <li>Select one or more <strong>target repositories</strong>.</li>
                  <li>Type your question in the search bar.</li>
                  <li>
                    Pick a <strong>search mode</strong>: <em>AI Answer</em> synthesizes a
                    grounded answer (slower); <em>Graph only</em> hits the graph DB
                    directly (no model, ~a second).
                  </li>
                  <li>Hit <strong>Search</strong>, then narrow results with the file and tag facets.</li>
                  <li>
                    Inspect on the right: <strong>AI Answer</strong>,{' '}
                    <strong>Sources &amp; Provenance</strong>,{' '}
                    <strong>Neighborhood Map</strong>, and <strong>Top Tags</strong>.
                  </li>
                </ol>

                <h4 class="help-section">
                  <i class="fa-solid fa-download" /> Install
                </h4>
                <p class="help-text">One command installs the CLI, the Claude skill, and this web UI:</p>
                <pre class="help-code"><code>tmp=$(mktemp -d) && curl -fsSL https://github.com/metuur-ai/local-search/releases/latest/download/local-search-bundle.tar.gz | tar -xz -C "$tmp" && bash "$tmp/bundle/install.sh"</code></pre>
                <p class="help-text">Then launch the UI (needs Node ≥ 18):</p>
                <pre class="help-code"><code>local-search ui</code></pre>
                <p class="help-text">
                  More install options (release bundle, prebuilt binary, build from
                  source) on{' '}
                  <a
                    href="https://github.com/metuur-ai/local-search/blob/main/README.md#install"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    the install guide <i class="fa-solid fa-arrow-up-right-from-square" />
                  </a>
                  .
                </p>

                <h4 class="help-section">
                  <i class="fa-solid fa-terminal" /> Handy CLI commands
                </h4>
                <ul class="help-cmds">
                  <li>
                    <code>local-search doctor</code>
                    <span>Diagnose install, DB health, and stale-index drift.</span>
                  </li>
                  <li>
                    <code>local-search size</code>
                    <span>DB file size and a per-repo index breakdown.</span>
                  </li>
                  <li>
                    <code>local-search scan</code>
                    <span>Re-index repos when <code>doctor</code> reports drift.</span>
                  </li>
                </ul>

                <h4 class="help-section">
                  <i class="fa-solid fa-book" /> More documentation
                </h4>
                <p class="help-text">
                  Full guide, search syntax, and configuration on{' '}
                  <a
                    href="https://github.com/metuur-ai/local-search/blob/main/user-guide/index.md"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub <i class="fa-solid fa-arrow-up-right-from-square" />
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* New-search confirm — shown when "New search" is pressed while a run is
          still in progress. Confirming cancels the active search. */}
      {showNewSearchConfirm &&
        createPortal(
          <div
            class="alert-modal"
            data-testid="new-search-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) cancelNewSearchConfirm();
            }}
          >
            <div class="alert-modal-panel" role="alertdialog" aria-modal="true">
              <h3 class="alert-modal-title">
                <i class="fa-solid fa-triangle-exclamation" /> A search is in progress
              </h3>
              <p class="alert-modal-text">
                Starting a new search will <strong>cancel</strong> the run currently in
                progress and clear its results. Continue?
              </p>
              <div class="alert-modal-actions">
                <button
                  type="button"
                  class="btn-ghost"
                  data-testid="new-search-keep"
                  onClick={cancelNewSearchConfirm}
                >
                  Keep searching
                </button>
                <button
                  type="button"
                  class="btn-danger"
                  data-testid="new-search-confirm"
                  onClick={confirmNewSearch}
                >
                  Cancel &amp; start new
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Rollover alert — shown the first time a follow-up would push past the
          3-version window, explaining that the oldest answer is dropped. */}
      {rolloverText != null &&
        createPortal(
          <div
            class="alert-modal"
            data-testid="rollover-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) cancelRollover();
            }}
          >
            <div class="alert-modal-panel" role="alertdialog" aria-modal="true">
              <h3 class="alert-modal-title">
                <i class="fa-solid fa-clock-rotate-left" /> Keeping the last {MAX_ANSWER_VERSIONS} answers
              </h3>
              <p class="alert-modal-text">
                You already have {MAX_ANSWER_VERSIONS} saved answer versions. Continuing keeps only
                the most recent {MAX_ANSWER_VERSIONS} — the <strong>oldest</strong> answer and its
                question will roll off the transcript.
              </p>
              <div class="alert-modal-actions">
                <button type="button" class="btn-ghost" onClick={cancelRollover}>
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn-primary"
                  data-testid="rollover-continue"
                  onClick={confirmRollover}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
