export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiClientError';
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

export class ApiClientValidationError extends ApiClientError {
  readonly errors?: unknown[];

  constructor(message: string, errors?: unknown[]) {
    super(message);
    this.name = 'ApiClientValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, ApiClientValidationError.prototype);
  }
}

export class ApiClientRequestValidationError extends ApiClientError {
  readonly errors: unknown[];

  constructor(message: string, errors: unknown[]) {
    super(message);
    this.name = 'ApiClientRequestValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, ApiClientRequestValidationError.prototype);
  }
}

export class ApiClientStatusError extends ApiClientError {
  readonly statusCode: number;
  readonly responseBody?: unknown;

  constructor(statusCode: number, responseBody?: unknown) {
    super(`HTTP error! status: ${statusCode}`);
    this.name = 'ApiClientStatusError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    Object.setPrototypeOf(this, ApiClientStatusError.prototype);
  }
}

export class ApiClientFetchError extends ApiClientError {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ApiClientFetchError';
    this.cause = cause;
    Object.setPrototypeOf(this, ApiClientFetchError.prototype);
  }
}
