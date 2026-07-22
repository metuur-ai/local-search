import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRegistry } from '../src/sessions.js';
import { createNormalizer } from '../src/normalize.js';
import { handleStream, handleReply, handleCancel } from '../src/query.js';
import { makeFakeChild } from './helpers/fakeChild.js';

/** A fake SSE `res`: captures written frames and header/end state. */
function makeFakeRes() {
  const res = {
    frames: '',
    headers: null,
    ended: false,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    write(chunk) {
      this.frames += chunk;
      return true;
    },
    end() {
      this.ended = true;
    },
  };
  return res;
}

/** A fake req that lets us fire 'close' on demand. */
function makeFakeReq() {
  return new EventEmitter();
}

/** A fake req carrying a JSON body (drives readJsonBody). */
function makeBodyReq(obj) {
  const req = new EventEmitter();
  process.nextTick(() => {
    req.emit('data', JSON.stringify(obj));
    req.emit('end');
  });
  return req;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Small helper: create a session with a manually-driven child already streaming.
function seedSession(registry, deps, child) {
  const session = registry.create({
    child,
    normalizer: createNormalizer(),
    phase: 'running',
    deps,
  });
  return session;
}

// ---------------------------------------------------------------------------
// R-8.2 — POST /reply validation + argv
// ---------------------------------------------------------------------------

test('R-8.2: reply 404 unknown, 409 no claudeSessionId, 400 empty text', async () => {
  const registry = createRegistry();

  // 404 unknown session
  const res404 = makeFakeRes();
  await handleReply(makeBodyReq({ text: 'x' }), res404, { registry, id: 'nope' });
  assert.equal(res404.status, 404);

  // 409 when session has no captured claudeSessionId
  const child = makeFakeChild([], { autoClose: false });
  const session = seedSession(registry, {}, child);
  const res409 = makeFakeRes();
  await handleReply(makeBodyReq({ text: 'x' }), res409, { registry, id: session.id });
  assert.equal(res409.status, 409);

  // 400 when text is empty/whitespace
  session.claudeSessionId = 'sid-1';
  const res400 = makeFakeRes();
  await handleReply(makeBodyReq({ text: '   ' }), res400, { registry, id: session.id });
  assert.equal(res400.status, 400);
});

test('R-8.2: reply spawns child with --resume <claudeSessionId> and reply text as prompt', async () => {
  const registry = createRegistry();
  const spawnArgs = [];
  // Inject a fake spawnClaude that mirrors the real arg building via buildClaudeArgs.
  const deps = {
    spawnClaude: ({ prompt, resumeSessionId }) => {
      // mirror claude.js: buildClaudeArgs prepends --resume, prompt is final positional
      const args = resumeSessionId
        ? ['--resume', resumeSessionId, '-p', prompt]
        : ['-p', prompt];
      spawnArgs.push(args);
      return makeFakeChild([], { autoClose: false });
    },
  };
  const child = makeFakeChild([], { autoClose: false });
  const session = seedSession(registry, deps, child);
  session.claudeSessionId = 'sid-abc';

  const res = makeFakeRes();
  await handleReply(makeBodyReq({ text: 'the second repo' }), res, { registry, id: session.id });

  assert.equal(res.status, 200);
  assert.equal(spawnArgs.length, 1);
  const args = spawnArgs[0];
  assert.ok(args.includes('--resume'));
  assert.equal(args[args.indexOf('--resume') + 1], 'sid-abc');
  assert.equal(args[args.length - 1], 'the second repo');
  assert.equal(session.phase, 'running');
});

// ---------------------------------------------------------------------------
// R-8.4 — resumed turn arrives on the ORIGINAL SSE stream
// ---------------------------------------------------------------------------

test('R-8.4: resumed turn frames arrive on the original connected SSE res', async () => {
  const registry = createRegistry();

  // initial child asks a question then closes -> session goes awaiting-reply
  const questionChild = makeFakeChild([
    { type: 'system', subtype: 'init', session_id: 'sid-q', model: 'm' },
    { type: 'result', subtype: 'success', is_error: false, result: 'Which repo?' },
  ]);

  let resumeChild;
  const deps = {
    spawnClaude: () => {
      resumeChild = makeFakeChild([], { autoClose: false });
      return resumeChild;
    },
  };
  const session = seedSession(registry, deps, questionChild);

  // Connect an SSE client on the original stream.
  const req = makeFakeReq();
  const res = makeFakeRes();
  handleStream(req, res, { registry, id: session.id });

  // let the question turn play out
  await wait(30);
  assert.match(res.frames, /event: question/);
  assert.equal(session.phase, 'awaiting-reply');
  assert.equal(res.ended, false, 'stream stays open while awaiting reply');

  // POST a reply; resumed turn should write to the SAME res.
  const replyRes = makeFakeRes();
  await handleReply(makeBodyReq({ text: 'the first one' }), replyRes, { registry, id: session.id });
  assert.equal(replyRes.status, 200);

  // feed the resumed child's answer -> lands on the ORIGINAL res
  resumeChild.stdout.push(
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Here is your answer.' }) + '\n',
  );
  await wait(20);

  assert.match(res.frames, /event: answer/);
  assert.match(res.frames, /Here is your answer\./);
});

// ---------------------------------------------------------------------------
// R-8.5 — the reply is recorded in the feed
// ---------------------------------------------------------------------------

test('R-8.5: accepting a reply writes a `reply` frame with the text', async () => {
  const registry = createRegistry();
  const deps = { spawnClaude: () => makeFakeChild([], { autoClose: false }) };
  const child = makeFakeChild([], { autoClose: false });
  const session = seedSession(registry, deps, child);
  session.claudeSessionId = 'sid-r';

  const req = makeFakeReq();
  const res = makeFakeRes();
  handleStream(req, res, { registry, id: session.id });

  await handleReply(makeBodyReq({ text: 'my clarification' }), makeFakeRes(), {
    registry,
    id: session.id,
  });

  assert.match(res.frames, /event: reply/);
  assert.match(res.frames, /my clarification/);
});

// ---------------------------------------------------------------------------
// R-8.3 — awaiting-reply session survives idle/timeout and is still resumable
// ---------------------------------------------------------------------------

test('R-8.3: awaiting-reply session survives the safety timeout and stays resumable', async () => {
  const registry = createRegistry();
  const questionChild = makeFakeChild([
    { type: 'system', subtype: 'init', session_id: 'sid-keep', model: 'm' },
    { type: 'result', subtype: 'success', is_error: false, result: 'Clarify please?' },
  ]);
  let resumed = false;
  const deps = {
    timeoutMs: 15, // tiny safety window
    heartbeatMs: 1000,
    spawnClaude: () => {
      resumed = true;
      return makeFakeChild([], { autoClose: false });
    },
  };
  const session = seedSession(registry, deps, questionChild);

  const req = makeFakeReq();
  const res = makeFakeRes();
  handleStream(req, res, { registry, id: session.id });

  await wait(40); // past the timeout window
  // session must still exist and be paused (not reaped, not errored by timeout)
  assert.ok(registry.get(session.id), 'session still present');
  assert.equal(session.phase, 'awaiting-reply');
  assert.doesNotMatch(res.frames, /event: error/);

  // a subsequent reply still resumes it
  const replyRes = makeFakeRes();
  await handleReply(makeBodyReq({ text: 'ok' }), replyRes, { registry, id: session.id });
  assert.equal(replyRes.status, 200);
  assert.ok(resumed);
});

// ---------------------------------------------------------------------------
// R-9.1 — heartbeat frames + interval cleared on close
// ---------------------------------------------------------------------------

test('R-9.1: heartbeat frames emitted (~heartbeatMs) and interval cleared on close', async () => {
  const registry = createRegistry();
  const child = makeFakeChild([], { autoClose: false }); // never produces tool activity
  const session = seedSession(registry, { heartbeatMs: 10, timeoutMs: 100000 }, child);

  const req = makeFakeReq();
  const res = makeFakeRes();
  handleStream(req, res, { registry, id: session.id });

  await wait(45);
  const beats = (res.frames.match(/event: heartbeat/g) ?? []).length;
  assert.ok(beats >= 1, `expected >=1 heartbeat, got ${beats}`);

  // close the child -> timers cleared, no more heartbeats afterwards
  child.stdout.push(null);
  child.emit('close', 0);
  await wait(5);
  const framesAtClose = res.frames;
  await wait(40);
  assert.equal(res.frames, framesAtClose, 'no heartbeat frames after close');
});

// ---------------------------------------------------------------------------
// R-9.3 — POST /cancel
// ---------------------------------------------------------------------------

test('R-9.3: cancel 404 unknown; otherwise kills child and writes done{cancelled:true}', async () => {
  const registry = createRegistry();

  // 404 unknown
  const res404 = makeFakeRes();
  handleCancel(makeFakeReq(), res404, { registry, id: 'nope' });
  assert.equal(res404.status, 404);

  // active session: cancel kills child + writes done{cancelled:true}
  const child = makeFakeChild([], { autoClose: false });
  const session = seedSession(registry, {}, child);
  const req = makeFakeReq();
  const res = makeFakeRes();
  handleStream(req, res, { registry, id: session.id });

  const cancelRes = makeFakeRes();
  handleCancel(makeFakeReq(), cancelRes, { registry, id: session.id });

  assert.equal(cancelRes.status, 200);
  assert.equal(child.killed, true, 'child process group killed');
  assert.equal(session.phase, 'done');
  assert.match(res.frames, /event: done/);
  assert.match(res.frames, /"cancelled":true/);
});

// ---------------------------------------------------------------------------
// R-9.4 — generous safety timeout -> explicit error + kill (only if running)
// ---------------------------------------------------------------------------

test('R-9.4: over-running child hits the safety timeout -> error frame + killed', async () => {
  const registry = createRegistry();
  const child = makeFakeChild([], { autoClose: false }); // never closes
  const session = seedSession(registry, { timeoutMs: 15, heartbeatMs: 100000 }, child);

  const req = makeFakeReq();
  const res = makeFakeRes();
  handleStream(req, res, { registry, id: session.id });

  await wait(40);
  assert.match(res.frames, /event: error/);
  assert.match(res.frames, /timeout/);
  assert.equal(child.killed, true, 'over-running child killed on timeout');
  assert.equal(session.phase, 'done');
});
