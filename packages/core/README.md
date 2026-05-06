# @sst-puppeteer/core

Runtime-agnostic domain core for sst-puppeteer.

Owns the `SSTSession` orchestrator, the three event sources (PTY / SSE / log file), event fusion, deploy/resource/invocation state machines, and the AWS Lambda invoker. Defines the `PtyAdapter` port; concrete adapters live in `@sst-puppeteer/pty-node` and `@sst-puppeteer/pty-bun`.

This package never imports `node-pty`, `child_process`, or `bun` — that constraint is enforced by an eslint rule and a runtime isolation test.

**v0.1 status:** types and class skeletons only. All public methods throw `NotImplementedError`.
