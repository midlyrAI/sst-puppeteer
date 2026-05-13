import { expectTypeOf } from 'expect-type';
import { test } from 'vitest';
import {
  type StartSessionInput,
  type StartSessionOutput,
  type StartSessionTool,
  type StopSessionInput,
  type StopSessionOutput,
  type StopSessionTool,
  type Tool,
  type WaitForReadyInput,
  type WaitForReadyOutput,
  type WaitForReadyTool,
  type WaitForNextReadyInput,
  type WaitForNextReadyOutput,
  type WaitForNextReadyTool,
} from '../src/index.js';

test('every concrete Tool subclass matches its declared input/output types', () => {
  expectTypeOf<StartSessionTool>().toMatchTypeOf<Tool<StartSessionInput, StartSessionOutput>>();
  expectTypeOf<WaitForReadyTool>().toMatchTypeOf<Tool<WaitForReadyInput, WaitForReadyOutput>>();
  expectTypeOf<WaitForNextReadyTool>().toMatchTypeOf<
    Tool<WaitForNextReadyInput, WaitForNextReadyOutput>
  >();
  expectTypeOf<StopSessionTool>().toMatchTypeOf<Tool<StopSessionInput, StopSessionOutput>>();
});
