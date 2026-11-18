export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors: unknown[];
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, errors: unknown[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message = 'Bad request', errors: unknown[] = []) {
    return new ApiError(400, message, errors);
  }

  /** Request is well-formed but fails validation (field-level errors). */
  static validation(errors: unknown[] = [], message = 'Validation failed') {
    return new ApiError(422, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, message);
  }
}
