//go:build !windows

package main

import (
	"os"
	"syscall"
)

// repoLock is a held per-repo advisory lock backed by an OS file lock (flock).
type repoLock struct{ f *os.File }

// acquireRepoLock opens (creating if needed) the lock file at path and takes a
// non-blocking exclusive flock on it (R-5.12). The returned held is false when
// another live process already holds the lock — the caller then no-ops rather
// than running a second concurrent scan of the same repo.
//
// Because flock is owned by the open file description, the kernel releases it
// automatically when this process exits — normally or on a crash/kill — so a
// dead holder never wedges automation forever (R-5.13); no stale-lock cleanup
// is needed.
func acquireRepoLock(path string) (lock *repoLock, held bool, err error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, false, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close() //nolint:errcheck
		if err == syscall.EWOULDBLOCK {
			return nil, false, nil // already held by another process → no-op
		}
		return nil, false, err
	}
	return &repoLock{f: f}, true, nil
}

// release unlocks and closes the lock file. Safe to call on a nil lock.
func (l *repoLock) release() {
	if l == nil || l.f == nil {
		return
	}
	syscall.Flock(int(l.f.Fd()), syscall.LOCK_UN) //nolint:errcheck
	l.f.Close()                                   //nolint:errcheck
}
