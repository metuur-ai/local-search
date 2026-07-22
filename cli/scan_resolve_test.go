package main

import (
	"strings"
	"testing"
)

func TestResolveScanTarget(t *testing.T) {
	// Two nested repos to exercise deepest-enclosing resolution.
	outer := repoEntry{Name: "outer", Path: "/Users/me/work"}
	inner := repoEntry{Name: "inner", Path: "/Users/me/work/proj"}
	other := repoEntry{Name: "other", Path: "/Users/me/other"}
	all := []repoEntry{outer, inner, other}

	tests := []struct {
		name      string
		args      []string
		cwd       string
		repos     []repoEntry
		wantMode  scanMode
		wantNames []string
		wantErr   string // substring; "" means expect no error
	}{
		{
			name:      "no-arg inside exactly one repo",
			args:      nil,
			cwd:       "/Users/me/other/sub",
			repos:     all,
			wantMode:  modeSurgical,
			wantNames: []string{"other"},
		},
		{
			name:      "no-arg nested under multiple repos - longest wins",
			args:      nil,
			cwd:       "/Users/me/work/proj/deep",
			repos:     all,
			wantMode:  modeSurgical,
			wantNames: []string{"inner"},
		},
		{
			name:    "no-arg outside any repo errors",
			args:    nil,
			cwd:     "/tmp/nowhere",
			repos:   all,
			wantErr: "not inside a registered repo",
		},
		{
			name:      "known name selects that repo",
			args:      []string{"outer"},
			cwd:       "/tmp/nowhere",
			repos:     all,
			wantMode:  modeSurgical,
			wantNames: []string{"outer"},
		},
		{
			name:    "unknown name errors",
			args:    []string{"ghost"},
			cwd:     "/Users/me/work",
			repos:   all,
			wantErr: "unknown repo ghost",
		},
		{
			name:      "all selects full rebuild over every repo",
			args:      []string{"all"},
			cwd:       "/tmp/nowhere",
			repos:     all,
			wantMode:  modeFullRebuild,
			wantNames: []string{"outer", "inner", "other"},
		},
		{
			name:    "empty repo set errors with guidance",
			args:    nil,
			cwd:     "/Users/me/work",
			repos:   nil,
			wantErr: "no repos added yet",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mode, targets, err := resolveScanTarget(tt.args, tt.cwd, tt.repos)

			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tt.wantErr)
				}
				if !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tt.wantErr)) {
					t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if mode != tt.wantMode {
				t.Fatalf("mode = %v, want %v", mode, tt.wantMode)
			}
			var gotNames []string
			for _, r := range targets {
				gotNames = append(gotNames, r.Name)
			}
			if len(gotNames) != len(tt.wantNames) {
				t.Fatalf("targets = %v, want %v", gotNames, tt.wantNames)
			}
			for i := range gotNames {
				if gotNames[i] != tt.wantNames[i] {
					t.Fatalf("targets = %v, want %v", gotNames, tt.wantNames)
				}
			}
		})
	}
}
