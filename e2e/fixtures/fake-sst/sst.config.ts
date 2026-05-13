/**
 * Cosmetic SST v3 config used by the e2e fake fixture.
 *
 * Parsed by `src/core/infra/config/sst-config-parser.ts` via the
 * `new sst.x.DevCommand(<name>, { dev: { command: ... } })` regex.
 * Pane names with the `Task-` prefix are classified as `kind: 'task'`
 * (see `sst-config-parser.ts:367`).
 *
 * This config is never actually executed by SST — the fake `bin/sst`
 * impersonates `sst dev` and synthesises everything we need.
 */
declare const sst: {
  x: {
    DevCommand: new (
      name: string,
      opts: { dev: { command: string; autostart?: boolean } },
    ) => unknown;
  };
};

export default {
  app: () => ({ name: 'fake-sst-fixture', stage: 'e2e' }),
  run: async () => {
    new sst.x.DevCommand('backend', { dev: { command: 'node noop.js', autostart: true } });
    new sst.x.DevCommand('fe', { dev: { command: 'node noop.js', autostart: true } });
    new sst.x.DevCommand('worker', { dev: { command: 'node noop.js', autostart: true } });
    new sst.x.DevCommand('Task-migrate', { dev: { command: 'node noop.js', autostart: true } });
    new sst.x.DevCommand('Task-seed', { dev: { command: 'node noop.js', autostart: false } });
  },
};
