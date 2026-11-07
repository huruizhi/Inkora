SHELL := /bin/zsh
PROJECT := Inkora.xcodeproj
SCHEME := Inkora
DERIVED_DATA := $(CURDIR)/build/DerivedData

.PHONY: setup lint test run build clean generate editor-build require-xcode

setup: require-xcode
	HOMEBREW_NO_AUTO_UPDATE=1 brew bundle install --no-upgrade
	pnpm --dir editor install --frozen-lockfile
	$(MAKE) editor-build
	xcodegen generate

lint:
	xcrun swift-format lint --strict --recursive app/Sources tests/InkoraTests
	pnpm --dir editor lint

test: editor-build generate require-xcode
	pnpm --dir editor test
	xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-destination 'platform=macOS' -derivedDataPath $(DERIVED_DATA) test

build: editor-build generate require-xcode
	xcodebuild -quiet -project $(PROJECT) -scheme $(SCHEME) \
		-configuration Debug -derivedDataPath $(DERIVED_DATA) build

run: build
	open "$(DERIVED_DATA)/Build/Products/Debug/Inkora.app"

editor-build:
	pnpm --dir editor build

generate:
	xcodegen generate

require-xcode:
	@xcodebuild -version >/dev/null 2>&1 && \
		xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1 || { \
		echo "Full Xcode with completed license and first-launch setup is required." >&2; \
		echo "Run: sudo xcodebuild -license && sudo xcodebuild -runFirstLaunch" >&2; \
		exit 1; \
	}

clean:
	rm -rf "$(CURDIR)/build" editor/dist Inkora.xcodeproj
