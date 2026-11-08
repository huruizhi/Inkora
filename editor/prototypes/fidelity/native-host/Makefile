# INK-PROT-007: 隔离 WKWebView 宿主构建入口。
# 只新增本目录文件；产物全部进 artifacts/（不提交）。
#
# build  : 编译、打包 entry.html 副本、ad-hoc 签名、静态校验（本任务执行）
# verify : codesign / 资源 / 版本信息复查（非 UI）
# run    : 仅在持有项目 UI 锁并完成 preflight 后由后续验证者执行
#
# 可在构建时指定新的已验收 HTML 入口（后续集成 005/006 时无需改宿主）：
#   make -C editor/prototypes/fidelity/native-host build ENTRY_HTML=<repo 相对路径>

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
$(APP_DIR): | $(CONTENTS)
	mkdir -p $@


.PHONY: build verify run clean

build: $(APP_DIR) $(ARTIFACTS)/build-manifest.json
	@codesign --verify --strict --verbose=2 $(APP_DIR)
	@echo "== build OK =="

$(MACOS_DIR)/$(APP_NAME): Sources/main.swift | $(MACOS_DIR)
	swiftc -O -target arm64-apple-macos$(MIN_MACOS) \
		-o $@ Sources/main.swift -framework AppKit -framework WebKit 2>&1 | tee $(ARTIFACTS)/swiftc.log
	@echo "swiftc exit: $$?"

$(CONTENTS)/Info.plist: Resources/Info.plist | $(CONTENTS)
	@BASELINE=$$(cd $(ROOT) && git rev-parse HEAD); \
	SRC_SHA=$$(shasum -a 256 $(ENTRY_HTML) | cut -d' ' -f1); \
	ENTRY_NAME=$$(basename $(ENTRY_HTML)); \
	sed -e "s|__FIDELITY_ENTRY_NAME__|$$ENTRY_NAME|" \
	    -e "s|__FIDELITY_SOURCE_SHA__|$$SRC_SHA|" \
	    -e "s|__FIDELITY_BASELINE__|$$BASELINE|" \
	    -e "s|__FIDELITY_CSP_INJECTED__|$(CSP_INJECT)|" \
	    -e "s|__FIDELITY_BUNDLE_SHA__|pending|" $< > $@

$(RES_DIR)/entry.html: $(ENTRY_HTML) scripts/prepare_entry.py | $(RES_DIR)
	@python3 scripts/prepare_entry.py $(ENTRY_HTML) $@ $(CSP_INJECT) > $(ARTIFACTS)/entry-report.json
	@cat $(ARTIFACTS)/entry-report.json
	@BUNDLED_SHA=$$(python3 -c "import json;print(json.load(open('$(ARTIFACTS)/entry-report.json'))['bundled_sha256'])"); \
	plutil -replace FidelityBundleSHA256 -string $$BUNDLED_SHA $(CONTENTS)/Info.plist

$(ARTIFACTS)/build-manifest.json: $(MACOS_DIR)/$(APP_NAME) $(CONTENTS)/Info.plist $(RES_DIR)/entry.html
	@BASELINE=$$(cd $(ROOT) && git rev-parse HEAD); \
	SDK=$$(sw_vers -productVersion); XCODE=$$(xcodebuild -version | tr '\n' ' '); \
	python3 -c "import json,sys; \
	r=json.load(open('$(ARTIFACTS)/entry-report.json')); \
	m={'bundle_id':'$(BUNDLE_ID)','baseline_commit':'$$BASELINE','os':'$$SDK','toolchain':'$$XCODE','entry':r}; \
	json.dump(m,open('$(ARTIFACTS)/build-manifest.json','w'),indent=2,ensure_ascii=False)"
	@codesign --force --sign - --timestamp=none --options runtime \
		--entitlements Entitlements.plist $(APP_DIR)
	@echo "== ad-hoc signed =="

$(MACOS_DIR) $(RES_DIR) $(CONTENTS) $(ARTIFACTS):
	mkdir -p $@

verify: $(APP_DIR)
	@echo "-- codesign --"; codesign -dv --verbose=2 $(APP_DIR) 2>&1
	codesign --verify --strict --verbose=2 $(APP_DIR)
	@echo "-- entitlements --"; codesign -d --entitlements :- --xml $(APP_DIR) 2>/dev/null | plutil -p -
	@echo "-- bundle resources --"; ls -l $(RES_DIR)
	@echo "-- build manifest --"; cat $(ARTIFACTS)/build-manifest.json

# 禁止在本任务中执行 UI 启动；run 仅提供给后续人工验证者。
run: build
	@echo "前置条件：持有项目 UI 锁 + preflight 通过（见 README.md）。"
	@read -p "确认后回车以启动 " _; open $(APP_DIR)

clean:
	rm -rf $(ARTIFACTS)
