/**
 * Custom error classes for better error handling
 */

/**
 * Base error class for application-specific errors
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Configuration-related errors (env vars, config files)
 */
export class ConfigError extends AppError {
  constructor(message: string) {
    super(`Configuration error: ${message}`);
  }
}

/**
 * Network/RPC-related errors
 */
export class NetworkError extends AppError {
  constructor(message: string, public readonly cause?: Error) {
    super(`Network error: ${message}`);
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(`Validation error: ${message}`);
  }
}
