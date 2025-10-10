export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiClientError';
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }

  public getLogData() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
    };
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

  public getLogData() {
    return {
      ...super.getLogData(),
      errors: this.errors,
    };
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

  public getLogData() {
    return {
      ...super.getLogData(),
      errors: this.errors,
    };
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

  public getLogData() {
    const responseBodyString = this.responseBody ? JSON.stringify(this.responseBody) : undefined;
    const partialResponseBody = responseBodyString
      ? responseBodyString.slice(0, 50) +
        (responseBodyString.length > 50
          ? '...' + responseBodyString.slice(-50, responseBodyString.length)
          : '')
      : undefined;
    return {
      ...super.getLogData(),
      statusCode: this.statusCode,
      responseBody: partialResponseBody,
    };
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

  public getLogData() {
    return {
      ...super.getLogData(),
      cause: this.cause,
    };
  }
}
