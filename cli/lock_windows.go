//go:build windows

package main

import "os"

// repoLock holds the path of a best-effort per-repo lock file on Windows.
type repoLock struct{ path string }

// acquireRepoLock is the Windows best-effort fallback for the per-repo lock
// (the LLD marks non-unix locking as best-effort/documented; unix flock is
// first-class). It exclusively creates the lock file: if creation succeeds we
// hold the lock; if the file already exists another trigger holds it and held
// is false, so the caller no-ops (R-5.12). release removes the file. A crashed
// holder can leave the file behind — acceptable per the documented best-effort
// contract; unix is the crash-safe path (R-5.13).
func acquireRepoLock(path string) (lock *repoLock, held bool, err error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return nil, false, nil // already held → no-op
		}
		return nil, false, err
	}
	f.Close() //nolint:errcheck
	return &repoLock{path: path}, true, nil
}

// release removes the lock file. Safe to call on a nil lock.
func (l *repoLock) release() {
	if l == nil || l.path == "" {
		return
	}
	os.Remove(l.path) //nolint:errcheck
}
