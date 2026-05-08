export type Unsubscribe = () => void;

/**
 * Generic event-bus contract: subscribe to a typed event by its discriminator.
 *
 * @example
 * ```ts
 * const off = session.on('state-change', (e) => logger.info(e.from + ' -> ' + e.to));
 * // later
 * off();
 * ```
 */
export interface IObservable<TEvent extends { type: string }> {
  on<T extends TEvent['type']>(
    type: T,
    handler: (event: Extract<TEvent, { type: T }>) => void,
  ): Unsubscribe;
}
