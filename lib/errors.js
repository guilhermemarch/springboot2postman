class SpringBoot2PostmanError extends Error {
    constructor(message, code, details = null) {
        super(message);
        this.name = 'SpringBoot2PostmanError';
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ProjectNotFoundError extends SpringBoot2PostmanError {
    constructor(path) {
        super(
            `Project path does not exist: ${path}`,
            'PROJECT_NOT_FOUND',
            { path }
        );
        this.name = 'ProjectNotFoundError';
    }
}

class NoControllersFoundError extends SpringBoot2PostmanError {
    constructor(path) {
        super(
            'No Spring Boot controllers found in project',
            'NO_CONTROLLERS_FOUND',
            { path }
        );
        this.name = 'NoControllersFoundError';
    }
}

class OpenApiFetchError extends SpringBoot2PostmanError {
    constructor(source, originalError) {
        super(
            `Failed to fetch OpenAPI spec from: ${source}`,
            'OPENAPI_FETCH_FAILED',
            { source, originalError: originalError.message }
        );
        this.name = 'OpenApiFetchError';
    }
}

class InvalidOpenApiError extends SpringBoot2PostmanError {
    constructor(reason) {
        super(
            `Invalid OpenAPI specification: ${reason}`,
            'INVALID_OPENAPI',
            { reason }
        );
        this.name = 'InvalidOpenApiError';
    }
}

class ParseError extends SpringBoot2PostmanError {
    constructor(file, originalError) {
        super(
            `Failed to parse Java file: ${file}`,
            'PARSE_ERROR',
            { file, originalError: originalError.message }
        );
        this.name = 'ParseError';
    }
}

class ConversionError extends SpringBoot2PostmanError {
    constructor(reason) {
        super(
            `Failed to convert to Postman collection: ${reason}`,
            'CONVERSION_FAILED',
            { reason }
        );
        this.name = 'ConversionError';
    }
}

module.exports = {
    SpringBoot2PostmanError,
    ProjectNotFoundError,
    NoControllersFoundError,
    OpenApiFetchError,
    InvalidOpenApiError,
    ParseError,
    ConversionError,
};
