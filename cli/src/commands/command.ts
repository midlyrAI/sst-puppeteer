import { type Writable } from 'node:stream';
import { type ZodType } from 'zod';

export interface CliContext {
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly cwd: string;
}

export interface HelpSchema {
  readonly input: ZodType;
  readonly output: ZodType;
}

export abstract class Command {
  abstract readonly name: string;
  abstract readonly description: string;
  readonly hidden: boolean = false;
  abstract execute(args: readonly string[], ctx: CliContext): Promise<number>;
  helpSchema?(): HelpSchema;
}
