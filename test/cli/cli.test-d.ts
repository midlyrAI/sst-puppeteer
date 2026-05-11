import { expectTypeOf } from 'expect-type';
import { test } from 'vitest';
import { type Command, type VersionCommand } from '../../src/cli/index.js';

test('VersionCommand satisfies Command', () => {
  expectTypeOf<VersionCommand>().toMatchTypeOf<Command>();
});
