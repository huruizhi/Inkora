# PROTOTYPE-only entry points. No dependency installation is performed.
PNPM ?= /Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm
LOCKED_EDITOR ?= /Users/rayhu/Documents/projects/Inkora/editor
EDITOR := ../..
.PHONY: build lint test run
build:
	@set -e; created=0; \
	if [ ! -e $(EDITOR)/node_modules ]; then ln -s $(LOCKED_EDITOR)/node_modules $(EDITOR)/node_modules; created=1; fi; \
	trap 'if [ "$$created" = 1 ]; then rm $(EDITOR)/node_modules; fi' EXIT; \
	node build.mjs
lint:
	@set -e; created=0; \
	if [ ! -e $(EDITOR)/node_modules ]; then ln -s $(LOCKED_EDITOR)/node_modules $(EDITOR)/node_modules; created=1; fi; \
	trap 'if [ "$$created" = 1 ]; then rm $(EDITOR)/node_modules; fi' EXIT; \
	$(PNPM) --dir $(EDITOR) exec tsc -p prototypes/source-authority/tsconfig.json
test:
	@set -e; created=0; \
	if [ ! -e $(EDITOR)/node_modules ]; then ln -s $(LOCKED_EDITOR)/node_modules $(EDITOR)/node_modules; created=1; fi; \
	trap 'if [ "$$created" = 1 ]; then rm $(EDITOR)/node_modules; fi' EXIT; \
	node build.mjs; \
	$(PNPM) --dir $(EDITOR) exec tsc -p prototypes/source-authority/tsconfig.json; \
	node test.mjs
run:
	@set -e; created=0; \
	if [ ! -e $(EDITOR)/node_modules ]; then ln -s $(LOCKED_EDITOR)/node_modules $(EDITOR)/node_modules; created=1; fi; \
	trap 'if [ "$$created" = 1 ]; then rm $(EDITOR)/node_modules; fi' EXIT; \
	node build.mjs; \
	open PROTOTYPE.html
