//go:build windows

package main

import (
	"os/exec"
	"strconv"
	"syscall"
)

// detachSysProcAttr starts the child in a new process group so it survives the
// parent exiting.
func detachSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{CreationFlags: 0x00000200} // CREATE_NEW_PROCESS_GROUP
}

// killPID terminates the daemon and its child tree (node → local-search).
func killPID(pid int) error {
	return exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(pid)).Run()
}
