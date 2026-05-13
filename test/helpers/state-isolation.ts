import * as os from 'node:os';

/**
 * Guard against tests accidentally writing into the developer's real
 * `~/.sst-puppeteer/`. Every test that touches session state must call
 * this in `beforeEach` after stubbing `SST_PUPPETEER_STATE_ROOT` to a
 * tmpdir.
 */
export const assertStateIsolated = (): void => {
  const root = process.env['SST_PUPPETEER_STATE_ROOT'];
  if (root === undefined || root === '') {
    throw new Error('state-isolation: SST_PUPPETEER_STATE_ROOT is not set; refusing to run.');
  }
  const tmp = os.tmpdir();
  if (!root.startsWith('/tmp/') && !root.startsWith(tmp)) {
    throw new Error(`state-isolation: SST_PUPPETEER_STATE_ROOT=${root} is not under a tmpdir.`);
  }
};
