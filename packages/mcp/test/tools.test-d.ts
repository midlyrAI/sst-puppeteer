import { expectTypeOf } from 'expect-type';
import { test } from 'vitest';
import {
  type InvokeFunctionInput,
  type InvokeFunctionOutput,
  type InvokeFunctionTool,
  type ReadLogsInput,
  type ReadLogsOutput,
  type ReadLogsTool,
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
  type WaitForRedeployInput,
  type WaitForRedeployOutput,
  type WaitForRedeployTool,
} from '../src/index.js';

test('every concrete Tool subclass matches its declared input/output types', () => {
  expectTypeOf<StartSessionTool>().toMatchTypeOf<Tool<StartSessionInput, StartSessionOutput>>();
  expectTypeOf<WaitForReadyTool>().toMatchTypeOf<Tool<WaitForReadyInput, WaitForReadyOutput>>();
  expectTypeOf<WaitForRedeployTool>().toMatchTypeOf<
    Tool<WaitForRedeployInput, WaitForRedeployOutput>
  >();
  expectTypeOf<InvokeFunctionTool>().toMatchTypeOf<
    Tool<InvokeFunctionInput, InvokeFunctionOutput>
  >();
  expectTypeOf<ReadLogsTool>().toMatchTypeOf<Tool<ReadLogsInput, ReadLogsOutput>>();
  expectTypeOf<StopSessionTool>().toMatchTypeOf<Tool<StopSessionInput, StopSessionOutput>>();
});
