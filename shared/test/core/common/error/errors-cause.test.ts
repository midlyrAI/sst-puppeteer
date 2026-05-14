/**
 * errors-cause.test.ts
 *
 * Verifies that each typed error class in errors.ts:
 *   - Extends SstPuppeteerError (and therefore Error)
 *   - Accepts a `cause` option and exposes it via Error.prototype.cause
 */

import { describe, expect, it } from 'vitest';
import {
  SstPuppeteerError,
  NotImplementedError,
  UpdateFailedError,
  CommandNotFoundError,
  CommandAlreadyRunningError,
  CommandNotRunningError,
  ConfigNotFoundError,
  StreamConnectionError,
} from '../../../../src/core/common/error/errors.js';

const CAUSE = new Error('root cause');

describe('typed errors — cause propagation', () => {
  it('SstPuppeteerError sets .cause', () => {
    const err = new SstPuppeteerError('msg', { cause: CAUSE });
    expect(err.cause).toBe(CAUSE);
    expect(err).toBeInstanceOf(Error);
  });

  it('NotImplementedError is instanceof SstPuppeteerError', () => {
    // NotImplementedError does not accept cause (symbol-only constructor)
    const err = new NotImplementedError('MySymbol');
    expect(err).toBeInstanceOf(SstPuppeteerError);
    expect(err.message).toContain('MySymbol');
  });

  it('UpdateFailedError sets .cause', () => {
    const err = new UpdateFailedError('deploy failed', 'arn:aws:cf:stack', { cause: CAUSE });
    expect(err.cause).toBe(CAUSE);
    expect(err).toBeInstanceOf(SstPuppeteerError);
  });

  it('CommandNotFoundError sets .cause', () => {
    const err = new CommandNotFoundError('no such command', { cause: CAUSE });
    expect(err.cause).toBe(CAUSE);
    expect(err).toBeInstanceOf(SstPuppeteerError);
  });

  it('CommandAlreadyRunningError sets .cause', () => {
    const err = new CommandAlreadyRunningError('already running', { cause: CAUSE });
    expect(err.cause).toBe(CAUSE);
    expect(err).toBeInstanceOf(SstPuppeteerError);
  });

  it('CommandNotRunningError sets .cause', () => {
    const err = new CommandNotRunningError('not running', { cause: CAUSE });
    expect(err.cause).toBe(CAUSE);
    expect(err).toBeInstanceOf(SstPuppeteerError);
  });

  it('ConfigNotFoundError sets .cause', () => {
    const err = new ConfigNotFoundError('not found', '/path/to/sst.config.ts', { cause: CAUSE });
    expect(err.cause).toBe(CAUSE);
    expect(err).toBeInstanceOf(SstPuppeteerError);
  });

  it('StreamConnectionError sets .cause', () => {
    const err = new StreamConnectionError('connection refused', 'http://localhost:3000', 3, {
      cause: CAUSE,
    });
    expect(err.cause).toBe(CAUSE);
    expect(err).toBeInstanceOf(SstPuppeteerError);
  });
});
