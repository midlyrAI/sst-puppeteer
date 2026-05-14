export interface FormatOptions {
  readonly pretty?: boolean;
}

export const formatOutput = (data: unknown, opts: FormatOptions = {}): string => {
  return opts.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
};
