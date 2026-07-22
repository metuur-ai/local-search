//go:build !windows

package main

import "syscall"

// detachSysProcAttr puts the child in its own process group so it survives the
// parent exiting and can be killed as a group.
func detachSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true}
}

// killPID terminates the daemon and its children (killing the process group so
// the node server and any local-search grandchildren also die).
func killPID(pid int) error {
	if err := syscall.Kill(-pid, syscall.SIGTERM); err != nil {
		return syscall.Kill(pid, syscall.SIGTERM)
	}
	return nil
}
