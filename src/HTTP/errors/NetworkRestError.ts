/* eslint-disable no-restricted-syntax */
import RestError from './RestError';

export default class NetworkRestError extends RestError {
  /**
   *
   * @param message Basic Error Message
   * @param options We can attach any extra info/properties for this error
   */
  constructor(message, options = {}) {
    super(message);
    for (const [key, value] of Object.entries(options)) {
      this[key] = value;
    }
  }

  //   get statusCode() {
  //     return 404;
  //   }
}
