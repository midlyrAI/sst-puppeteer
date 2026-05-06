import { type Writable } from 'node:stream';

export interface CliContext {
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly cwd: string;
}

export abstract class Command {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract execute(args: readonly string[], ctx: CliContext): Promise<number>;
}
