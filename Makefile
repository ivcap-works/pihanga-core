SHELL := /bin/bash

DOMAIN     := pihanga-core

ROOT_DIR := $(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))

GIT_BRANCH := $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
GIT_SHORT  := $(shell git rev-parse --short HEAD 2>/dev/null || echo "local")

# ─── Colours ─────────────────────────────────────────────────────────────────
BOLD  := $(shell printf '\033[1m')
RESET := $(shell printf '\033[0m')
GREEN := $(shell printf '\033[0;32m')
CYAN  := $(shell printf '\033[0;36m')

# ─── Docs ────────────────────────────────────────────────────────────────────
# Custom image adds mkdocs-llmstxt-md on top of squidfunk/mkdocs-material.
# Re-run `make docs-image` after changing docs/requirements.txt.
DOCS_IMAGE  := pihanga-core-docs:local
DOCS_DIR    := $(ROOT_DIR)/docs
# Mount the whole project so snippets can reach root-level files.
DOCS_DOCKER := docker run --rm -v "$(ROOT_DIR):/project" -w /project/docs $(DOCS_IMAGE)

.DEFAULT_GOAL := help

.PHONY: help install build docs check lint lint-fix type-check \
        test test-run test-coverage \
        docs-image docs-serve docs-build docs-deploy \
        publish clean

help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\n$(BOLD)Usage:$(RESET)\n  make $(CYAN)<target>$(RESET)\n"} \
	  /^[a-zA-Z_0-9-]+:.*?##/ { printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2 } \
	  /^##@/ { printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5) }' \
	  $(MAKEFILE_LIST)

##@ Setup

install: ## Install dependencies
	yarn install

##@ Build

build: install ## Compile TypeScript and generate TypeDoc API docs (output: dist/)
	rm -rf ${ROOT_DIR}/dist
	yarn build

docs: install ## Generate TypeDoc API reference only (output: dist/typedoc/)
	yarn docs

##@ Code Quality

check: lint type-check test-run ## Run all checks: lint, type-check, and tests (CI gate)
	@echo ""
	@echo "$(GREEN)$(BOLD)All checks passed ✓$(RESET)"

lint: ## Run ESLint
	yarn lint

lint-fix: ## Run ESLint with auto-fix
	yarn lint:fix

type-check: ## Run TypeScript type checking (no emit)
	yarn type-check

##@ Testing

test: ## Run Vitest in watch mode
	yarn test:watch

test-run: ## Run Vitest once (CI mode)
	yarn test:run

test-coverage: ## Run tests with V8 coverage report
	yarn test:coverage

##@ Documentation (MkDocs)

docs-image: ## Build the custom docs Docker image (run after changing docs/requirements.txt)
	docker build -t $(DOCS_IMAGE) $(DOCS_DIR)
	@echo ""
	@echo "$(GREEN)$(BOLD)Docs image built: $(DOCS_IMAGE) ✓$(RESET)"

docs-serve: docs-image ## Serve MkDocs site locally with live reload (http://localhost:8000)
	docker run --rm -p 8000:8000 -v "$(ROOT_DIR):/project" -w /project/docs $(DOCS_IMAGE) \
	  serve --dev-addr=0.0.0.0:8000

docs-build: docs-image ## Build the static MkDocs site (output: docs/site/)
	$(DOCS_DOCKER) build --strict
	@echo ""
	@echo "$(GREEN)$(BOLD)Docs built → docs/site/ ✓$(RESET)"

docs-deploy: docs-image ## Deploy MkDocs site to GitHub Pages via gh-deploy
	docker run --rm -v "$(ROOT_DIR):/project" -w /project/docs \
	  -v "$(HOME)/.ssh:/root/.ssh" $(DOCS_IMAGE) gh-deploy --force
	@echo ""
	@echo "$(GREEN)$(BOLD)Docs deployed to GitHub Pages ✓$(RESET)"

##@ Publishing

publish: build ## Build and publish to npm
	npm publish

##@ Cleanup

clean: ## Remove build artefacts (dist, coverage, docs/site)
	rm -rf ${ROOT_DIR}/dist ${ROOT_DIR}/coverage ${ROOT_DIR}/docs/site
