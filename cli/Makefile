BIN     := local-search
DIST    := dist
INSTALL := $(HOME)/.local/bin/$(BIN)


.PHONY: build build-all test test-v lint vet fmt deps install local-install clean

build:
	go build -o $(BIN) .

build-all:
	GOOS=darwin  GOARCH=amd64 go build -o $(DIST)/$(BIN)-darwin-amd64 .
	GOOS=darwin  GOARCH=arm64 go build -o $(DIST)/$(BIN)-mac-silicon-darwin-arm64 .
	GOOS=linux   GOARCH=amd64 go build -o $(DIST)/$(BIN)-linux-amd64 .
	GOOS=linux   GOARCH=arm64 go build -o $(DIST)/$(BIN)-linux-arm64 .
	GOOS=windows GOARCH=amd64 go build -o $(DIST)/$(BIN)-windows-amd64.exe .

test:
	go test ./...

test-v:
	go test ./... -v

lint: vet
	go vet ./...

vet:
	go vet ./...

fmt:
	gofmt -w .

deps:
	go mod download

install: deps local-install

local-install: build
	mkdir -p $(dir $(INSTALL))
	cp $(BIN) $(INSTALL)

clean:
	rm -f $(BIN)
	rm -rf $(DIST)
