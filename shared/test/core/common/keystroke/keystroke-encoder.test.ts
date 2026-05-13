import { describe, expect, it } from 'vitest';
import { KEY } from '../../../../src/core/common/keystroke/keystroke-encoder.js';

describe('KEY — keystroke encoder byte values', () => {
  it('arrowDown is ESC [ B', () => {
    expect(KEY.arrowDown).toBe('\x1b[B');
  });

  it('arrowUp is ESC [ A', () => {
    expect(KEY.arrowUp).toBe('\x1b[A');
  });

  it('arrowLeft is ESC [ D', () => {
    expect(KEY.arrowLeft).toBe('\x1b[D');
  });

  it('arrowRight is ESC [ C', () => {
    expect(KEY.arrowRight).toBe('\x1b[C');
  });

  it('enter is carriage return (0x0D)', () => {
    expect(KEY.enter).toBe('\r');
    expect(KEY.enter.charCodeAt(0)).toBe(0x0d);
  });

  it('keyJ is lowercase j', () => {
    expect(KEY.keyJ).toBe('j');
  });

  it('keyK is lowercase k', () => {
    expect(KEY.keyK).toBe('k');
  });

  it('keyX is lowercase x', () => {
    expect(KEY.keyX).toBe('x');
  });

  it('keyF is lowercase f', () => {
    expect(KEY.keyF).toBe('f');
  });

  it('ctrlZ is 0x1A', () => {
    expect(KEY.ctrlZ).toBe('\x1a');
    expect(KEY.ctrlZ.charCodeAt(0)).toBe(0x1a);
  });

  it('ctrlC is 0x03', () => {
    expect(KEY.ctrlC).toBe('\x03');
    expect(KEY.ctrlC.charCodeAt(0)).toBe(0x03);
  });

  it('ctrlL is 0x0C', () => {
    expect(KEY.ctrlL).toBe('\x0c');
    expect(KEY.ctrlL.charCodeAt(0)).toBe(0x0c);
  });

  it('escape is ESC (0x1B)', () => {
    expect(KEY.escape).toBe('\x1b');
    expect(KEY.escape.charCodeAt(0)).toBe(0x1b);
  });

  it('backspace is DEL (0x7F)', () => {
    expect(KEY.backspace).toBe('\x7f');
    expect(KEY.backspace.charCodeAt(0)).toBe(0x7f);
  });
});
