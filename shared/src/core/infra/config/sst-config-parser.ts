/**
 * sst-config-parser.ts
 *
 * Static regex-based parser for `sst.config.ts` files. Finds all
 * `new sst.x.DevCommand(<NAME>, <OPTS_OBJ>)` declarations and extracts
 * CommandSpec values from them.
 *
 * LIMITATIONS (by design — this is intentionally a regex parser, not a TS AST parser):
 *
 * 1. Does NOT follow function-call indirection.
 *    e.g. `createDevelopmentStack()` that returns DevCommands internally will NOT be matched.
 *    The `new sst.x.DevCommand(...)` literal must appear in the parsed file.
 *
 * 2. Does NOT evaluate conditionals.
 *    e.g. `cond ? new sst.x.DevCommand("A", ...) : null` will OVER-INCLUDE "A" regardless
 *    of whether `cond` evaluates to true or false at runtime. Both branches of a ternary
 *    are included.
 *
 * 3. Does NOT follow imports.
 *    DevCommand declarations in other files (e.g. a `stacks/development.ts` imported from
 *    `sst.config.ts`) are not parsed. Only declarations in the target file are matched.
 *
 * For complex or conditional configs (e.g. midlyr enterprise), use `SessionOptions.commands`
 * to supply an explicit CommandSpec[] override — that bypasses this parser entirely.
 */

import { readFileSync } from 'node:fs';
import { type Logger } from '../../common/logger/logger.js';
import { type CommandSpec } from '../../common/contract/command.js';
import { ConfigNotFoundError } from '../../common/error/errors.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseSstConfig(
  configPath: string,
  opts?: { logger?: Logger },
): readonly CommandSpec[] {
  let source: string;
  try {
    source = readFileSync(configPath, 'utf8');
  } catch (err) {
    throw new ConfigNotFoundError(`sst.config.ts not found at path: ${configPath}`, configPath, {
      cause: err,
    });
  }

  if (source.trim().length === 0) {
    opts?.logger?.warn('parseSstConfig: file is empty, returning []', { configPath });
    return [];
  }

  const results = extractDevCommands(source, opts?.logger);

  if (results.length === 0) {
    opts?.logger?.warn('parseSstConfig: no DevCommand declarations found in file', {
      configPath,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/**
 * Regex that matches the start of a DevCommand declaration:
 *   new sst.x.DevCommand("Name",
 * Captures the name string (content only — no quotes).
 * The name may be single-quoted, double-quoted, or backtick-quoted.
 */
const DEV_COMMAND_START_RE =
  /new\s+sst\.x\.DevCommand\s*\(\s*(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`)\s*,\s*/g;

function extractDevCommands(source: string, logger?: Logger): CommandSpec[] {
  const specs: CommandSpec[] = [];

  let match: RegExpExecArray | null;
  DEV_COMMAND_START_RE.lastIndex = 0;

  while ((match = DEV_COMMAND_START_RE.exec(source)) !== null) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name === undefined) {
      logger?.warn('parseSstConfig: matched DevCommand start but name capture failed — skipping');
      continue;
    }

    // The opts object starts at the character right after the match.
    const optsStart = match.index + match[0].length;

    if (source[optsStart] !== '{') {
      logger?.warn(`parseSstConfig: DevCommand "${name}" — expected '{' after name arg, skipping`, {
        position: optsStart,
      });
      continue;
    }

    // Extract the balanced brace block for the options object.
    const optsBody = extractBalancedBraces(source, optsStart);
    if (optsBody === null) {
      logger?.warn(
        `parseSstConfig: DevCommand "${name}" — unbalanced braces in opts object, skipping`,
      );
      continue;
    }

    // Parse required field: dev.command
    const devBlock = extractDevBlock(optsBody);
    const command = devBlock !== null ? extractStringField(devBlock, 'command') : null;

    if (command === null) {
      logger?.warn(
        `parseSstConfig: DevCommand "${name}" — missing required dev.command field, skipping`,
      );
      continue;
    }

    // Parse optional fields from dev block.
    const directory =
      devBlock !== null ? (extractStringField(devBlock, 'directory') ?? undefined) : undefined;

    const autostartRaw = devBlock !== null ? extractBooleanField(devBlock, 'autostart') : null;
    const autostart = autostartRaw ?? true; // SST default is true

    // Parse top-level optional fields.
    const environment = parseEnvironmentBlock(optsBody, logger);
    const link = parseLinkArray(optsBody, logger);

    specs.push({
      name,
      command,
      directory,
      environment: environment ?? undefined,
      autostart,
      link: link ? [...link] : undefined,
      killable: true,
    });
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Balanced-brace extractor
// ---------------------------------------------------------------------------

/**
 * Starting at `startPos` (which must be a `{` character), walk the source
 * character-by-character tracking brace depth, skipping over string literals
 * and line/block comments. Returns the full block including the outer braces,
 * or null if the braces are unbalanced.
 */
function extractBalancedBraces(source: string, startPos: number): string | null {
  if (source[startPos] !== '{') return null;

  let depth = 0;
  let i = startPos;
  const len = source.length;

  while (i < len) {
    const ch = source[i];

    // Skip line comment.
    if (ch === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < len && source[i] !== '\n') i++;
      continue;
    }

    // Skip block comment.
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Skip string literals (single, double, backtick).
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < len) {
        if (source[i] === '\\') {
          i += 2; // skip escaped char
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(startPos, i + 1);
      }
    }

    i++;
  }

  return null; // unbalanced
}

// ---------------------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------------------

/**
 * Extract the body of the `dev: { ... }` block from an opts object body string.
 * Returns the content INSIDE the braces (not including the outer braces), or null.
 */
function extractDevBlock(optsBody: string): string | null {
  // Find `dev:` then extract the balanced block.
  const devKeyRe = /\bdev\s*:\s*\{/g;
  const match = devKeyRe.exec(optsBody);
  if (match === null) return null;

  const blockStart = match.index + match[0].length - 1; // position of the `{`
  const block = extractBalancedBraces(optsBody, blockStart);
  if (block === null) return null;

  // Strip outer braces.
  return block.slice(1, -1);
}

/**
 * Extract a string literal value for a given field name from a block of text.
 * Matches:  fieldName: "value"  or  fieldName: 'value'  or  fieldName: `value`
 * Returns the string value (without quotes), or null if not found.
 */
function extractStringField(block: string, fieldName: string): string | null {
  const re = new RegExp(
    String.raw`\b${fieldName}\s*:\s*(?:"([^"\\]*)"|'([^'\\]*)'|\`([^\`\\]*)\`)`,
  );
  const match = re.exec(block);
  if (match === null) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/**
 * Extract a boolean literal value for a given field name from a block of text.
 * Matches:  fieldName: true  or  fieldName: false
 * Returns the boolean, or null if not found.
 */
function extractBooleanField(block: string, fieldName: string): boolean | null {
  const re = new RegExp(String.raw`\b${fieldName}\s*:\s*(true|false)\b`);
  const match = re.exec(block);
  if (match === null) return null;
  return match[1] === 'true';
}

// ---------------------------------------------------------------------------
// environment block parser
// ---------------------------------------------------------------------------

/**
 * Parse the `environment: { K: V, ... }` block from the opts body.
 * Values are coerced via best-effort regex: string literals, identifiers,
 * numbers, booleans. Returns undefined if the block is absent.
 * Returns an empty object if the block exists but is empty.
 * On parse failure for individual values, falls back to the raw text.
 */
function parseEnvironmentBlock(
  optsBody: string,
  logger?: Logger,
): Readonly<Record<string, string>> | null {
  const envKeyRe = /\benvironment\s*:\s*\{/g;
  const match = envKeyRe.exec(optsBody);
  if (match === null) return null;

  const blockStart = match.index + match[0].length - 1;
  const block = extractBalancedBraces(optsBody, blockStart);
  if (block === null) {
    logger?.warn('parseSstConfig: environment block has unbalanced braces — skipping environment');
    return null;
  }

  const inner = block.slice(1, -1).trim();
  if (inner.length === 0) return {};

  const result: Record<string, string> = {};

  // Match key: value pairs. Keys may be identifiers or quoted strings.
  // Values: string literal, identifier, number, boolean.
  const pairRe =
    /(?:([A-Za-z_$][A-Za-z0-9_$]*)|"([^"\\]*)"|'([^'\\]*)')\s*:\s*(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\]*)`|(\btrue\b|\bfalse\b|[A-Za-z_$][A-Za-z0-9_$.]*|-?\d+(?:\.\d+)?))/g;

  let pairMatch: RegExpExecArray | null;
  while ((pairMatch = pairRe.exec(inner)) !== null) {
    const key = pairMatch[1] ?? pairMatch[2] ?? pairMatch[3];
    const value = pairMatch[4] ?? pairMatch[5] ?? pairMatch[6] ?? pairMatch[7] ?? '';
    if (key !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// link array parser
// ---------------------------------------------------------------------------

/**
 * Parse the `link: [ident1, ident2, ...]` array from the opts body.
 * Best-effort identifier list extraction.
 */
function parseLinkArray(optsBody: string, _logger?: Logger): readonly string[] | null {
  const linkRe = /\blink\s*:\s*\[/g;
  const match = linkRe.exec(optsBody);
  if (match === null) return null;

  // Find the closing bracket with a simple bracket balance walker.
  let depth = 0;
  let i = match.index + match[0].length - 1;
  const len = optsBody.length;
  let arrayEnd = -1;

  while (i < len) {
    const ch = optsBody[i];
    if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        arrayEnd = i;
        break;
      }
    }
    i++;
  }

  if (arrayEnd === -1) return null;

  const inner = optsBody.slice(match.index + match[0].length, arrayEnd).trim();
  if (inner.length === 0) return [];

  // Extract identifiers (variable references, possibly property-access chains).
  const identRe = /[A-Za-z_$][A-Za-z0-9_$.]*/g;
  const ids: string[] = [];
  let idMatch: RegExpExecArray | null;
  while ((idMatch = identRe.exec(inner)) !== null) {
    ids.push(idMatch[0]);
  }

  return ids;
}
