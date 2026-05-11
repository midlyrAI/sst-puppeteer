import { type Command } from './command.js';

export class CommandRegistry {
  private readonly _commands = new Map<string, Command>();

  register(command: Command): void {
    this._commands.set(command.name, command);
  }

  get(name: string): Command | undefined {
    return this._commands.get(name);
  }

  list(): readonly Command[] {
    return Array.from(this._commands.values());
  }

  names(): readonly string[] {
    return Array.from(this._commands.keys());
  }

  size(): number {
    return this._commands.size;
  }
}
