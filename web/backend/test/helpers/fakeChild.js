import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

/**
 * makeFakeChild(ndjsonLines) -> a fake ChildProcess-like object:
 *  - .stdout : a Readable you can also push into; pre-seeded with ndjsonLines
 *  - .stderr : an empty Readable
 *  - .pid    : a fake pid
 *  - .kill() : records the call
 *  - EventEmitter: on('close'), on('error'), emit(...)
 *
 * If `ndjsonLines` are provided, they are pushed (each as its own `line\n`) on the
 * next tick and the stdout stream is ended; the child emits 'close' shortly after
 * so SSE handlers see a full run. Pass `{ autoClose:false }` to drive it manually.
 */
export function makeFakeChild(ndjsonLines = [], { autoClose = true, closeCode = 0 } = {}) {
  const emitter = new EventEmitter();

  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });

  emitter.stdout = stdout;
  emitter.stderr = stderr;
  emitter.pid = 424242;
  emitter.killed = false;
  emitter.kill = (signal) => {
    emitter.killed = true;
    emitter.lastSignal = signal;
    return true;
  };

  // Feed the scripted NDJSON on the next tick so listeners can attach first.
  if (ndjsonLines.length > 0 || autoClose) {
    setImmediate(() => {
      for (const line of ndjsonLines) {
        stdout.push(typeof line === 'string' ? line + '\n' : JSON.stringify(line) + '\n');
      }
      if (autoClose) {
        stdout.push(null);
        stderr.push(null);
        setImmediate(() => emitter.emit('close', closeCode));
      }
    });
  }

  return emitter;
}
