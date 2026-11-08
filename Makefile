SHELL := /bin/zsh
PROJECT := Inkora.xcodeproj
SCHEME := Inkora
DOCUMENT_UI_SCHEME := InkoraDocumentOpenUI
APP_BUNDLE_IDENTIFIER ?= com.huruizhi.Inkora
DERIVED_DATA := $(CURDIR)/build/DerivedData
ARTIFACTS_DIR ?= $(CURDIR)/artifacts
CAPTURE := $(CURDIR)/scripts/ci/run-and-capture.sh
UI_LOCK := $(CURDIR)/scripts/ci/with-ui-lock.sh
UI_PREFLIGHT := $(CURDIR)/scripts/ci/ui-preflight.sh
PNPM_VERSION := 11.25.0
PNPM := $(CURDIR)/.tools/node_modules/.bin/pnpm
NATIVE_RESULT := $(ARTIFACTS_DIR)/test-results/native.xcresult
DOCUMENT_UI_RESULT := $(ARTIFACTS_DIR)/test-results/document-open-ui.xcresult
BRIDGE_RESULT := $(ARTIFACTS_DIR)/test-results/bridge-native.xcresult
PERF_SAMPLES_DIR := $(CURDIR)/build/perf-samples
PERF_RESULTS_DIR := $(CURDIR)/build/perf-results
NATIVE_PERF_RESULT := $(ARTIFACTS_DIR)/test-results/native-perf.xcresult
WEBVIEW_PERF_RESULT := $(ARTIFACTS_DIR)/test-results/webview-perf.xcresult
LAUNCH_PERF_RESULT := $(ARTIFACTS_DIR)/test-results/launch-perf.xcresult
PERF_STRICT := $(if $(filter 1,$(INKORA_PERF_STRICT)),--fail,)

.PHONY: setup lint test test-editor test-bridge test-native test-document-open-ui test-ui \
	test-ui-release test-non-ui release-bundle-check test-ci test-all \
	build build-release run clean generate editor-build prepare-artifacts require-xcode \
	perf-samples perf-compare bench bench-full

setup: require-xcode
	HOMEBREW_NO_AUTO_UPDATE=1 brew bundle install --no-upgrade
	npm install --prefix "$(CURDIR)/.tools" --no-save --no-package-lock pnpm@$(PNPM_VERSION)
	$(PNPM) --dir editor install --frozen-lockfile
	$(MAKE) editor-build
	xcodegen generate

lint:
	xcrun swift-format lint --strict --recursive app/Sources tests/InkoraTests tests/InkoraUITests
	$(PNPM) --dir editor lint

test: test-all

test-editor: editor-build prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) editor \
		$(PNPM) --dir editor exec vitest run --exclude src/bridge.test.ts

test-bridge: editor-build generate require-xcode prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) bridge-editor \
		$(PNPM) --dir editor exec vitest run src/bridge.test.ts
	rm -rf "$(BRIDGE_RESULT)"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" INKORA_XCRESULT_PATH="$(BRIDGE_RESULT)" \
		$(CAPTURE) bridge-native \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-destination 'platform=macOS' -derivedDataPath $(DERIVED_DATA) \
		-resultBundlePath "$(BRIDGE_RESULT)" \
		-only-testing:InkoraTests/BridgeProtocolTests test

test-native: editor-build generate require-xcode prepare-artifacts
	rm -rf "$(NATIVE_RESULT)"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" INKORA_XCRESULT_PATH="$(NATIVE_RESULT)" \
		$(CAPTURE) native \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-destination 'platform=macOS' -derivedDataPath $(DERIVED_DATA) \
		-resultBundlePath "$(NATIVE_RESULT)" -only-testing:InkoraTests test

test-document-open-ui: editor-build generate require-xcode prepare-artifacts
	rm -rf "$(DOCUMENT_UI_RESULT)"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" INKORA_XCRESULT_PATH="$(DOCUMENT_UI_RESULT)" \
		INKORA_EXPORT_UI_ATTACHMENTS=1 TEST_RUNNER_INKORA_MARKDOWN_SNAPSHOT_SOURCE="$(HOME)/Library/Containers/com.huruizhi.Inkora.UITesting/Data/tmp/inkora-acceptance/current.md" \
		$(CAPTURE) document-open-ui \
		$(UI_LOCK) $(UI_PREFLIGHT) xcuitest \
		xcodebuild -quiet -project $(PROJECT) -scheme $(DOCUMENT_UI_SCHEME) \
		INKORA_BUNDLE_IDENTIFIER=com.huruizhi.Inkora.UITesting \
		-destination 'platform=macOS' -derivedDataPath $(DERIVED_DATA) \
		-resultBundlePath "$(DOCUMENT_UI_RESULT)" \
		-only-testing:InkoraUITests/DocumentOpenUITests \
		-only-testing:InkoraUITests/RecentFilesUITests \
		-only-testing:InkoraUITests/AcceptanceUITests test

test-ui: APP_BUNDLE_IDENTIFIER := com.huruizhi.Inkora.UITesting
test-ui: build prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) ui \
		$(UI_LOCK) $(UI_PREFLIGHT) desktop \
		tests/ci/ui-launch-smoke.sh \
		"$(DERIVED_DATA)/Build/Products/Debug/Inkora.app"

# Existing archive/export packages must be checked without rebuilding or changing
# their signing identity. Release scripts already sanitize/capture command output.
ifneq ($(strip $(RELEASE_APP_BUNDLE)),)
release-bundle-check:
	tests/ci/editor-bundle-smoke.sh "$(RELEASE_APP_BUNDLE)"
else
release-bundle-check: APP_BUNDLE_IDENTIFIER := com.huruizhi.Inkora.UITesting
release-bundle-check: build-release prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) release-bundle \
		tests/ci/editor-bundle-smoke.sh \
		"$(DERIVED_DATA)/Build/Products/Release/Inkora.app"
endif

test-ui-release: APP_BUNDLE_IDENTIFIER := com.huruizhi.Inkora.UITesting
test-ui-release: release-bundle-check
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) ui-release \
		$(UI_LOCK) $(UI_PREFLIGHT) desktop \
		tests/ci/ui-launch-smoke.sh \
		"$(DERIVED_DATA)/Build/Products/Release/Inkora.app"

test-ci: prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" tests/ci/entrypoint-smoke.sh
	tests/ci/release-smoke.sh
	tests/ci/ui-lock-smoke.sh
	node scripts/perf/compare-baseline.test.mjs

# Non-UI CI path: every suite that does not touch the desktop.
test-non-ui: test-editor test-bridge test-native test-ci

# test-ui is intentionally excluded: every XCUITest case in
# test-document-open-ui already launches the Debug app. Run `make test-ui`
# manually if needed.
test-all: test-editor test-bridge test-native test-document-open-ui test-ci

build: editor-build generate require-xcode prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) build-debug \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		INKORA_BUNDLE_IDENTIFIER=$(APP_BUNDLE_IDENTIFIER) \
		-configuration Debug -derivedDataPath $(DERIVED_DATA) build

build-release: editor-build generate require-xcode prepare-artifacts
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) build-release \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		INKORA_BUNDLE_IDENTIFIER=$(APP_BUNDLE_IDENTIFIER) \
		-configuration Release -derivedDataPath $(DERIVED_DATA) build

run: build
	open "$(DERIVED_DATA)/Build/Products/Debug/Inkora.app"

editor-build:
	$(PNPM) --dir editor build

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

# Performance baselines (INK-023). `make bench` is light, deterministic and
# CI-safe: it never launches the app UI. `make bench-full` adds the WKWebView
# load benchmarks and app launch benchmarks and requires a logged-in desktop
# (CI runner only). Set INKORA_PERF_STRICT=1 to fail on regression instead of
# warning.
perf-samples:
	node scripts/perf/generate-samples.mjs --output "$(PERF_SAMPLES_DIR)"

perf-compare:
	mkdir -p "$(ARTIFACTS_DIR)/perf/raw"
	cp "$(PERF_RESULTS_DIR)"/*.json "$(ARTIFACTS_DIR)/perf/raw/"
	cp "$(PERF_SAMPLES_DIR)/manifest.json" "$(ARTIFACTS_DIR)/perf/manifest.json"
	mkdir -p "$(ARTIFACTS_DIR)/perf"
	node scripts/perf/compare-baseline.mjs --results-dir "$(PERF_RESULTS_DIR)" \
		--report "$(ARTIFACTS_DIR)/perf/comparison.md" $(PERF_STRICT)

bench: perf-samples editor-build generate require-xcode prepare-artifacts
	rm -rf "$(PERF_RESULTS_DIR)" "$(ARTIFACTS_DIR)/perf"
	mkdir -p "$(PERF_RESULTS_DIR)"
	node scripts/perf/env-info.mjs --output "$(PERF_RESULTS_DIR)/environment.json"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) bench-editor \
		env INKORA_PERF_PROFILE=light INKORA_PERF_SAMPLES_DIR="$(PERF_SAMPLES_DIR)" \
		INKORA_PERF_OUTPUT="$(PERF_RESULTS_DIR)/editor.json" \
		$(PNPM) --dir editor exec vitest run --config vite.perf.config.ts
	rm -f "$(PERF_RESULTS_DIR)/native.json"
	rm -rf "$(NATIVE_PERF_RESULT)"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" INKORA_XCRESULT_PATH="$(NATIVE_PERF_RESULT)" $(CAPTURE) bench-native \
		env INKORA_PERF=1 TEST_RUNNER_INKORA_PERF=1 \
		INKORA_PERF_PROFILE=light TEST_RUNNER_INKORA_PERF_PROFILE=light \
		INKORA_PERF_SAMPLES_DIR="$(PERF_SAMPLES_DIR)" \
		TEST_RUNNER_INKORA_PERF_SAMPLES_DIR="$(PERF_SAMPLES_DIR)" \
		INKORA_PERF_OUTPUT="$(PERF_RESULTS_DIR)/native.json" \
		TEST_RUNNER_INKORA_PERF_OUTPUT="$(PERF_RESULTS_DIR)/native.json" \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-destination 'platform=macOS' -derivedDataPath $(DERIVED_DATA) \
		-resultBundlePath "$(NATIVE_PERF_RESULT)" \
		-only-testing:InkoraTests/PerformanceBaselineTests test
	$(MAKE) perf-compare

bench-full: bench
	rm -f "$(PERF_RESULTS_DIR)/editor.json"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" $(CAPTURE) bench-editor-full \
		env INKORA_PERF_PROFILE=full INKORA_PERF_SAMPLES_DIR="$(PERF_SAMPLES_DIR)" \
		INKORA_PERF_OUTPUT="$(PERF_RESULTS_DIR)/editor.json" \
		$(PNPM) --dir editor exec vitest run --config vite.perf.config.ts
	rm -f "$(PERF_RESULTS_DIR)/webview.json"
	rm -rf "$(WEBVIEW_PERF_RESULT)"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" INKORA_XCRESULT_PATH="$(WEBVIEW_PERF_RESULT)" $(CAPTURE) bench-webview \
		env INKORA_PERF=1 TEST_RUNNER_INKORA_PERF=1 \
		INKORA_PERF_PROFILE=full TEST_RUNNER_INKORA_PERF_PROFILE=full \
		INKORA_PERF_SAMPLES_DIR="$(PERF_SAMPLES_DIR)" \
		TEST_RUNNER_INKORA_PERF_SAMPLES_DIR="$(PERF_SAMPLES_DIR)" \
		INKORA_PERF_OUTPUT="$(PERF_RESULTS_DIR)/webview.json" \
		TEST_RUNNER_INKORA_PERF_OUTPUT="$(PERF_RESULTS_DIR)/webview.json" \
		xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-destination 'platform=macOS' -derivedDataPath $(DERIVED_DATA) \
		-resultBundlePath "$(WEBVIEW_PERF_RESULT)" \
		-only-testing:InkoraTests/PerformanceWebViewTests test
	rm -f "$(PERF_RESULTS_DIR)/launch.json"
	rm -rf "$(LAUNCH_PERF_RESULT)"
	INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" INKORA_XCRESULT_PATH="$(LAUNCH_PERF_RESULT)" $(CAPTURE) bench-launch \
		$(UI_LOCK) $(UI_PREFLIGHT) xcuitest \
		env TEST_RUNNER_INKORA_PERF=1 \
		TEST_RUNNER_INKORA_PERF_PROFILE=full \
		TEST_RUNNER_INKORA_PERF_OUTPUT="$(PERF_RESULTS_DIR)/launch.json" \
		xcodebuild -quiet -project $(PROJECT) -scheme $(DOCUMENT_UI_SCHEME) \
		INKORA_BUNDLE_IDENTIFIER=com.huruizhi.Inkora.UITesting \
		-destination 'platform=macOS' -derivedDataPath $(DERIVED_DATA) \
		-resultBundlePath "$(LAUNCH_PERF_RESULT)" \
		-only-testing:InkoraUITests/PerformanceBaselineUITests test
	xcrun xcresulttool export attachments --path "$(LAUNCH_PERF_RESULT)" \
		--output-path "$(PERF_RESULTS_DIR)/launch-attachments" --filter 'inkora-launch*'
	node scripts/perf/extract-launch-memory.mjs "$(LAUNCH_PERF_RESULT)" "$(PERF_RESULTS_DIR)/launch.json" "$(PERF_RESULTS_DIR)/launch-attachments"
	$(MAKE) perf-compare

# Direct distribution only; these targets never launch the App.
.PHONY: release-archive release-sign release-notarize release-dmg release-verify release release-dry-run
release-archive release-sign release-notarize release-dmg release-verify release release-dry-run:
	@INKORA_ARTIFACTS_DIR="$(ARTIFACTS_DIR)" scripts/release/release.sh $(patsubst release-%,%,$@)
