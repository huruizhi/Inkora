# PROTOTYPE-only entry points. No install/setup is performed.
PNPM ?= /Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm
EDITOR := ../..
.PHONY: build lint test run
build:
	node build.mjs
lint:
	$(PNPM) --dir $(EDITOR) exec tsc -p prototypes/fidelity/tsconfig.json
test: build lint
	node check.mjs
	node native-transaction-stage-check.mjs
	node ledger-integration-check.mjs
	node source-composition-guard-check.mjs
run: build
	open PROTOTYPE.html
