/** Typed application errors mapped to HTTP responses by the error handler. */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const NotFound = (message = 'Resource not found', details?: unknown) =>
  new AppError(404, 'not_found', message, details);

export const BadRequest = (message = 'Bad request', details?: unknown) =>
  new AppError(400, 'bad_request', message, details);

export const Unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);

export const Forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'forbidden', message);

export const Conflict = (message = 'Resource conflict', details?: unknown) =>
  new AppError(409, 'conflict', message, details);
