// Base error classes to extend from
export default class ApplicationError extends Error {
  get name() {
    return this.constructor.name;
  }
}
