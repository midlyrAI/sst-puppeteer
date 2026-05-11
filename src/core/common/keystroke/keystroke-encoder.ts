export const KEY = {
  arrowDown: '\x1b[B',
  arrowUp: '\x1b[A',
  arrowLeft: '\x1b[D',
  arrowRight: '\x1b[C',
  enter: '\r',
  keyJ: 'j',
  keyK: 'k',
  keyX: 'x',
  keyF: 'f',
  ctrlZ: '\x1a',
  ctrlC: '\x03',
  ctrlL: '\x0c',
  escape: '\x1b',
  backspace: '\x7f',
} as const;

export type KeySequence = (typeof KEY)[keyof typeof KEY];
