# INK-PROT-007: 隔离 WKWebView 宿主构建入口。
# 只新增本目录文件；产物全部进 artifacts/（不提交）。
#
# build  : 编译、打包 entry.html 副本、ad-hoc 签名、静态校验（本任务执行）
# verify : codesign / 资源 / 版本信息复查（非 UI）
# run    : 仅在持有项目 UI 锁并完成 preflight 后由后续验证者执行
#
# 可在构建时指定新的已验收 HTML 入口（后续集成 005/006 时无需改宿主）。
# ENTRY_HTML 是 make -C 到本目录后的相对路径（即相对 native-host/），
# 或使用仓库绝对路径，例如：
#   make -C editor/prototypes/fidelity/native-host build ENTRY_HTML=/abs/path/ACCEPTED.html
#
# build 为确定性顺序：每次完整重新生成二进制/入口副本/版本元数据/manifest
# 并最后签名，不依赖 make 依赖图与 mtime，对 make -j 安全。

SHELL      := /bin/bash
.SHELLFLAGS := -euo pipefail -c

APP_NAME    := FidelityHost
BUNDLE_ID   := com.huruizhi.Inkora.FidelityPrototype
ENTRY_HTML  ?= ../PROTOTYPE.html
MIN_MACOS   := 14.0
CSP_INJECT  ?= 1

ROOT        := ../../../..
ARTIFACTS   := artifacts
APP_DIR     := $(ARTIFACTS)/$(APP_NAME).app
CONTENTS    := $(APP_DIR)/Contents
MACOS_DIR   := $(CONTENTS)/MacOS
RES_DIR     := $(CONTENTS)/Resources
OBSERVER_JS := Resources/runtime-observer.js

.PHONY: build verify observer-check probe probe-preflight run clean

PROBE_BIN := $(ARTIFACTS)/ime-keypath-probe

build:
	rm -rf $(APP_DIR)
	mkdir -p $(MACOS_DIR) $(RES_DIR) $(ARTIFACTS)
	# 1) 编译：失败必须让 make 非零退出，日志完整保留
	if ! swiftc -O -target arm64-apple-macos$(MIN_MACOS) \
		-o $(MACOS_DIR)/$(APP_NAME) Sources/main.swift \
		-framework AppKit -framework WebKit > $(ARTIFACTS)/swiftc.log 2>&1; then \
		cat $(ARTIFACTS)/swiftc.log; echo "swiftc FAILED"; exit 1; fi
	# 2) 入口副本 + CSP 注入（仅副本）与字节级证据
	python3 scripts/prepare_entry.py $(ENTRY_HTML) $(RES_DIR)/entry.html $(CSP_INJECT) \
		> $(ARTIFACTS)/entry-report.json
	cat $(ARTIFACTS)/entry-report.json
	cp $(OBSERVER_JS) $(RES_DIR)/runtime-observer.js
	# 3) 版本元数据：每次从模板全新生成，写入真实 SHA/基线，无残留
	BASELINE=$$(cd $(ROOT) && git rev-parse HEAD); \
	SRC_SHA=$$(shasum -a 256 $(ENTRY_HTML) | cut -d' ' -f1); \
	BUNDLED_SHA=$$(python3 -c "import json;print(json.load(open('$(ARTIFACTS)/entry-report.json'))['bundled_sha256'])"); \
	OBSERVER_SHA=$$(shasum -a 256 $(OBSERVER_JS) | cut -d' ' -f1); \
	CSP_FLAG=$$(python3 -c "import json;print('1' if json.load(open('$(ARTIFACTS)/entry-report.json'))['csp_inserted'] else '0')"); \
	sed -e "s|__FIDELITY_ENTRY_NAME__|$$(basename $(ENTRY_HTML))|" \
	    -e "s|__FIDELITY_SOURCE_SHA__|$$SRC_SHA|" \
	    -e "s|__FIDELITY_BUNDLE_SHA__|$$BUNDLED_SHA|" \
	    -e "s|__FIDELITY_BASELINE__|$$BASELINE|" \
	    -e "s|__FIDELITY_OBSERVER_SHA__|$$OBSERVER_SHA|" \
	    -e "s|__FIDELITY_CSP_INJECTED__|$$CSP_FLAG|" \
	    Resources/Info.plist > $(CONTENTS)/Info.plist
	# 4) manifest（在签名前固化内容哈希，签名信息单独记录）
	BASELINE=$$(cd $(ROOT) && git rev-parse HEAD); \
	SDK=$$(sw_vers -productVersion); XCODE=$$(xcodebuild -version | tr '\n' ' '); \
	OBSERVER_SHA=$$(shasum -a 256 $(OBSERVER_JS) | cut -d' ' -f1); \
	python3 -c "import json,sys; \
	r=json.load(open('$(ARTIFACTS)/entry-report.json')); \
	o={'path':'Resources/runtime-observer.js','sha256':sys.argv[1]}; \
	m={'bundle_id':'$(BUNDLE_ID)','baseline_commit':'$$BASELINE','os':'$$SDK','toolchain':'$$XCODE','entry':r,'runtime_observer':o}; \
	json.dump(m,open('$(ARTIFACTS)/build-manifest.json','w'),indent=2,ensure_ascii=False)" "$$OBSERVER_SHA"
	# 5) 最后统一 ad-hoc 签名（Hardened Runtime + entitlements，entitlements 改动必然触发重签）
	codesign --force --sign - --timestamp=none --options runtime \
		--entitlements Entitlements.plist $(APP_DIR)
	codesign --verify --strict --verbose=2 $(APP_DIR)
	@echo "== build OK =="

verify: build
	@echo "-- codesign --"; codesign -dv --verbose=2 $(APP_DIR) 2>&1
	codesign --verify --strict --verbose=2 $(APP_DIR)
	@echo "-- entitlements --"; codesign -d --entitlements :- --xml $(APP_DIR) 2>/dev/null | plutil -p -
	@echo "-- Info.plist version keys --"; plutil -p $(CONTENTS)/Info.plist | grep -i fidelity
	@echo "-- bundle resources --"; ls -l $(RES_DIR)
	@echo "-- build manifest --"; cat $(ARTIFACTS)/build-manifest.json

observer-check:
	node observer-check.mjs

# INK-PROT-017: 独立、非沙盒的公开 CoreGraphics 键码路径探针。
# preflight 只读取当前进程已有权限；探针源码不调用权限申请 API。
probe:
	mkdir -p $(ARTIFACTS)
	swiftc -O -target arm64-apple-macos$(MIN_MACOS) \
		-o $(PROBE_BIN) Sources/ime_keypath_probe.swift \
		-framework AppKit -framework Carbon -framework CoreGraphics
	@echo "== probe build OK =="

probe-preflight: probe
	$(PROBE_BIN) preflight

# 禁止在本任务中执行 UI 启动；run 仅提供给后续人工验证者。
run: build
	@echo "前置条件：持有项目 UI 锁 + preflight 通过（见 README.md）。"
	@read -p "确认后回车以启动 " _; open $(APP_DIR)

clean:
	rm -rf $(ARTIFACTS)
