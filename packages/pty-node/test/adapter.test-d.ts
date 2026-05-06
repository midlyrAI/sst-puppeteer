import { expectTypeOf } from 'expect-type';
import { test } from 'vitest';
import { type PtyAdapter } from '@sst-puppeteer/core';
import { type NodePtyAdapter } from '../src/index.js';

test('NodePtyAdapter satisfies PtyAdapter', () => {
  expectTypeOf<NodePtyAdapter>().toMatchTypeOf<PtyAdapter>();
});
