const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}
