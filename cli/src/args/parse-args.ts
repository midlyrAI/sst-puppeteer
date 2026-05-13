import { parseArgs as nodeParseArgs, type ParseArgsConfig } from 'node:util';

export type { ParseArgsConfig };

/**
 * Thin wrapper around `node:util` `parseArgs` with consistent defaults:
 * - `strict: true` — unknown options throw
 * - `allowPositionals: true` — positional args are collected
 *
 * Commands may override these defaults by passing explicit values in `config`.
 */
export const parseCliArgs = (
  args: readonly string[],
  config: Omit<ParseArgsConfig, 'args'> = {},
): ReturnType<typeof nodeParseArgs> => {
  return nodeParseArgs({
    strict: true,
    allowPositionals: true,
    ...config,
    args: [...args],
  });
};
