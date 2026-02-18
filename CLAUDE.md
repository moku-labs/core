# CLAUDE.md

## Vision

**moku_core** is a micro-kernel for TypeScript: plugin registry, lifecycle, config, events, types. Everything else is a plugin. One export (`createCore`), three layers (core -> framework -> consumer), each constraining the layer above. Designed so an LLM can hold the entire API in context.

## Where to Find Things

- `specification/README.md` -- full spec index, open design variants
- `specification/13-KERNEL-PSEUDOCODE.md` -- reference implementation, all design decisions and their "why"
- `specification/ROADMAP.md` -- phased development plan
- `specification/02-CORE-API.md` -- function signatures
- `specification/12-PLUGIN-PATTERNS.md` -- plugin conventions, file structure, LLM prompt fragment

## Status

Pre-implementation. Specification complete, no source code yet.
