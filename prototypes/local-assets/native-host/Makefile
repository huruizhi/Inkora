SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

ROOT := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
BUILD := $(ROOT)/.build
APP := $(BUILD)/InkoraLocalAssetHost.app
CONTENTS := $(APP)/Contents
MACOS := $(CONTENTS)/MacOS
RESOURCES := $(CONTENTS)/Resources
TARGET := arm64-apple-macos14.0

SHARED_SOURCES := $(ROOT)/Sources/Shared/BrokerPolicy.swift
HOST_SOURCES := $(wildcard $(ROOT)/Sources/Host/*.swift) $(SHARED_SOURCES)
MODEL_SOURCES := $(ROOT)/Sources/ModelCheck/main.swift $(SHARED_SOURCES)
FIXTURE_SOURCES := $(ROOT)/Sources/FixtureControl/main.swift

.PHONY: build verify check fixture fixture-clean run clean

build: $(MACOS)/InkoraLocalAssetHost $(BUILD)/model-check $(BUILD)/fixture-control

$(BUILD):
	mkdir -p $@

$(MACOS)/InkoraLocalAssetHost: $(HOST_SOURCES) $(wildcard $(ROOT)/Resources/*) | $(BUILD)
	rm -rf $(APP)
	mkdir -p $(MACOS) $(RESOURCES)
	swiftc -swift-version 5 -parse-as-library -target $(TARGET) \
		-framework AppKit -framework WebKit -framework CryptoKit \
		-o $@ $(HOST_SOURCES)
	cp $(ROOT)/Resources/Info.plist $(CONTENTS)/Info.plist
	cp $(ROOT)/Resources/index.html $(ROOT)/Resources/app.js $(ROOT)/Resources/app.css $(RESOURCES)/
	(cd $(RESOURCES) && shasum -a 256 index.html app.js app.css > ResourceManifest.sha256)
	codesign --force --sign - \
		--entitlements $(ROOT)/Resources/InkoraLocalAssetHost.entitlements \
		--identifier com.huruizhi.Inkora.LocalAssetHostPrototype $(APP)
	codesign --verify --strict $(APP)

$(BUILD)/model-check: $(MODEL_SOURCES) | $(BUILD)
	swiftc -swift-version 5 -target $(TARGET) -o $@ $(MODEL_SOURCES)

$(BUILD)/fixture-control: $(FIXTURE_SOURCES) | $(BUILD)
	swiftc -swift-version 5 -target $(TARGET) -framework CryptoKit -o $@ $(FIXTURE_SOURCES)

verify: build
	bash $(ROOT)/scripts/verify.sh $(APP) $(ROOT)/Resources/InkoraLocalAssetHost.entitlements

check: build
	$(BUILD)/model-check
	$(MAKE) --no-print-directory verify
	@echo "check ok: pure model + build/signature/static verification only; no panel/bookmark/WK runtime claim"

fixture: $(BUILD)/fixture-control
	$(BUILD)/fixture-control prepare

fixture-clean: $(BUILD)/fixture-control
	$(BUILD)/fixture-control clean

# 必须由管理者在仓库根目录 with-ui-lock + ui-preflight desktop 包装后调用。
run: fixture verify
	open -W $(APP)

clean:
	rm -rf $(BUILD)
