export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiClientError';
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }

  public toErrorPlainObject() {
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

  public toErrorPlainObject() {
    return {
      ...super.toErrorPlainObject(),
      errors: this.errors,
    };
  }
}

export class ApiClientRequestValidationError extends ApiClientError {
  readonly errors: unknown[];
  readonly requestParams?: unknown;

  constructor(message: string, errors: unknown[], requestParams?: unknown) {
    super(message);
    this.name = 'ApiClientRequestValidationError';
    this.errors = errors;
    this.requestParams = requestParams;
    Object.setPrototypeOf(this, ApiClientRequestValidationError.prototype);
  }

  public toErrorPlainObject() {
    return {
      ...super.toErrorPlainObject(),
      errors: this.errors,
      requestParams: this.requestParams,
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

  public toErrorPlainObject() {
    const responseBodyString = this.responseBody ? JSON.stringify(this.responseBody) : undefined;
    const partialResponseBody = responseBodyString
      ? responseBodyString.slice(0, 50) +
        (responseBodyString.length > 50
          ? '...' + responseBodyString.slice(-50, responseBodyString.length)
          : '')
      : undefined;
    return {
      ...super.toErrorPlainObject(),
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

  public toErrorPlainObject() {
    return {
      ...super.toErrorPlainObject(),
      cause: this.cause,
    };
  }
}
