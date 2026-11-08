# INK-PROT-011 本地资源平台原型（第一部分）
# 入口：make build / make check / make clean
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
ROOT := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
BUILD := $(ROOT)/.build
EVIDENCE := $(ROOT)/evidence

SWIFT_TARGET := arm64-apple-macos14.0

.PHONY: build check clean

build: $(BUILD)/local-assets-model $(BUILD)/AssetPrototype.app/Contents/MacOS/AssetPrototype
	@echo "build ok: model + signed sandbox probe app"

$(BUILD):
	mkdir -p $@

# 状态模型 CLI（普通进程，scratch 文件系统场景）
$(BUILD)/local-assets-model: $(ROOT)/src/Model.swift | $(BUILD)
	swiftc -swift-version 5 -target $(SWIFT_TARGET) -o $@ $<
	shasum -a 256 $@ | sed 's|$(BUILD)/||'

# 签名 Sandbox headless 探针 .app：ad-hoc 签名 + 唯一 entitlement（App Sandbox）
$(BUILD)/AssetPrototype.app/Contents/MacOS/AssetPrototype: $(ROOT)/src/probe/main.swift \
		$(ROOT)/app-template/Info.plist $(ROOT)/ent/AssetPrototype.entitlements | $(BUILD)
	rm -rf $(BUILD)/AssetPrototype.app
	mkdir -p $(BUILD)/AssetPrototype.app/Contents/MacOS
	swiftc -swift-version 5 -target $(SWIFT_TARGET) \
		-o $(BUILD)/AssetPrototype.app/Contents/MacOS/AssetPrototype $(ROOT)/src/probe/main.swift
	cp $(ROOT)/app-template/Info.plist $(BUILD)/AssetPrototype.app/Contents/Info.plist
	# 签名失败必须真实失败（set -e）；不使用 sandbox-exec 或私有 API 替代
	codesign --force --sign - \
		--entitlements $(ROOT)/ent/AssetPrototype.entitlements \
		--identifier com.huruizhi.Inkora.AssetPrototype \
		$(BUILD)/AssetPrototype.app
	codesign --verify --strict $(BUILD)/AssetPrototype.app
	@echo "signed: ad-hoc + App Sandbox entitlement"
	codesign -d --entitlements - $(BUILD)/AssetPrototype.app 2>/dev/null || true
	shasum -a 256 $(BUILD)/AssetPrototype.app/Contents/MacOS/AssetPrototype | sed 's|$(BUILD)/||'

# 端到端检查：模型场景 + 沙盒探针 + 证据写入 evidence/
check: build
	bash $(ROOT)/scripts/run-check.sh

clean:
	rm -rf $(BUILD) $(ROOT)/scratch
