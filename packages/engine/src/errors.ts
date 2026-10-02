/** Thrown by API stubs until the engine agent implements them. The web falls back to mock mode on this. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`@manila/engine: ${what} is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}
