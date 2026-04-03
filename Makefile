# Convenience targets for development and global install from a clone.
.PHONY: install build help

help:
	@echo "Targets:"
	@echo "  make install  - npm install, build, npm install -g ."
	@echo "  make build    - npm run build"

build:
	npm run build

install:
	npm install
	npm run build
	npm install -g .
