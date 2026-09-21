/**
 * Base class for every error this channel throws. Callers should only ever need
 * `instanceof WhapprChannelError` (or one of its subclasses below) to recognize
 * an error as coming from this package.
 */
export abstract class WhapprChannelError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * A `createWhapprChannel()` option, or an `instanceId()`/`parseInstanceId()`
 * argument, was missing or malformed. `field` names the bad input.
 */
export class WhapprInvalidInputError extends WhapprChannelError {
  readonly field: string;

  constructor(field: string) {
    super(`Invalid Whappr channel input: ${field}.`);
    this.field = field;
  }
}

/** `parseInstanceId()` received a string that isn't a canonical id this package produced. */
export class WhapprInvalidInstanceIdError extends WhapprChannelError {
  constructor() {
    super('Invalid Whappr instance id.');
  }
}
