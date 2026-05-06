import { expectTypeOf } from 'expect-type';
import { test } from 'vitest';
import { type PtyAdapter } from '@sst-puppeteer/core';
import { type BunPtyAdapter } from '../src/index.js';

test('BunPtyAdapter satisfies PtyAdapter', () => {
  expectTypeOf<BunPtyAdapter>().toMatchTypeOf<PtyAdapter>();
});
