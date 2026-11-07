SHELL := /bin/zsh
PROJECT := Inkora.xcodeproj
SCHEME := Inkora
DERIVED_DATA := $(CURDIR)/build/DerivedData
ARTIFACTS_DIR ?= $(CURDIR)/artifacts
CAPTURE := $(CURDIR)/scripts/ci/run-and-capture.sh
NATIVE_RESULT := $(ARTIFACTS_DIR)/test-results/native.xcresult
BRIDGE_RESULT := $(ARTIFACTS_DIR)/test-results/bridge-native.xcresult

.PHONY: setup lint test test-editor test-bridge test-native test-ui test-ci test-all \
	build build-release run clean generate editor-build prepare-artifacts require-xcode

setup: require-xcode
	HOMEBREW_NO_AUTO_UPDATE=1 brew bundle install --no-upgrade
	pnpm --dir editor install --frozen-lockfile
	$(MAKE) editor-build
	xcodegen generate

lint:
	xcrun swift-format lint --strict --recursive app/Sources tests/InkoraTests
	pnpm --dir editor lint

test: test-all

test-editor: editor-build prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) editor \
		pnpm --dir editor exec vitest run src/editor-kernel.test.ts

test-bridge: editor-build generate require-xcode prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) bridge-editor \
		pnpm --dir editor exec vitest run src/bridge.test.ts
	rm -rf "$(BRIDGE_RESULT)"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) bridge-native \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-destination 'platform=macOS' -derivedDataPath $(DERIVED_DATA) \
		-resultBundlePath "$(BRIDGE_RESULT)" \
		-only-testing:InkoraTests/BridgeProtocolTests test

test-native: editor-build generate require-xcode prepare-artifacts
	rm -rf "$(NATIVE_RESULT)"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) native \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-destination 'platform=macOS' -derivedDataPath $(DERIVED_DATA) \
		-resultBundlePath "$(NATIVE_RESULT)" -only-testing:InkoraTests test

test-ui: build prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) ui \
		tests/ci/ui-launch-smoke.sh \
		"$(DERIVED_DATA)/Build/Products/Debug/Inkora.app"

test-ci: prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" tests/ci/entrypoint-smoke.sh

test-all: test-editor test-bridge test-native test-ui test-ci

build: editor-build generate require-xcode prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) build-debug \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-configuration Debug -derivedDataPath $(DERIVED_DATA) build

build-release: editor-build generate require-xcode prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) build-release \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-configuration Release -derivedDataPath $(DERIVED_DATA) build

run: build
	open "$(DERIVED_DATA)/Build/Products/Debug/Inkora.app"

editor-build:
	pnpm --dir editor build

generate:
	xcodegen generate

prepare-artifacts:
	mkdir -p "$(ARTIFACTS_DIR)/logs" "$(ARTIFACTS_DIR)/failures" \
		"$(ARTIFACTS_DIR)/test-results" "$(ARTIFACTS_DIR)/screenshots" \
		"$(ARTIFACTS_DIR)/markdown-snapshots"

require-xcode:
	@xcodebuild -version >/dev/null 2>&1 && \
		xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1 || { \
		echo "Full Xcode with completed license and first-launch setup is required." >&2; \
		echo "Run: sudo xcodebuild -license && sudo xcodebuild -runFirstLaunch" >&2; \
		exit 1; \
	}

clean:
	rm -rf "$(CURDIR)/build" "$(ARTIFACTS_DIR)" editor/dist Inkora.xcodeproj
