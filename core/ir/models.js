/**
 * Intermediate representation shared by the OpenAPI builder and the .http
 * renderer. Content types are never assumed here: the strategy sets them
 * from `produces`/`consumes` (defaulting to JSON only where Spring does).
 */

function createIR({ title = 'API', version = '1.0.0', description = '', serverUrl = null } = {}) {
    return {
        title,
        version,
        description,
        serverUrl,
        endpoints: [],
        schemas: {},
        tags: [],
    };
}

function createEndpoint({
    method,
    path,
    name,
    description = '',
    operationId = null,
    tags = [],
    deprecated = false,
}) {
    return {
        method: method.toUpperCase(),
        path,
        name,
        description,
        operationId,
        tags,
        deprecated,
        parameters: {
            path: [],
            query: [],
            header: [],
            cookie: [],
        },
        requestBody: null,
        responses: [],
    };
}

function createParameter({
    name,
    location,
    required = false,
    schema = { type: 'string' },
    description = '',
    example,
    defaultValue,
}) {
    const parameter = { name, in: location, required, schema };
    if (description) {
        parameter.description = description;
    }
    if (example !== undefined) {
        parameter.example = example;
    }
    if (defaultValue !== undefined) {
        parameter.defaultValue = defaultValue;
    }
    return parameter;
}

/**
 * @param {object} options
 *   contentType: media type (from `consumes` or JSON default)
 *   schema: JSON schema of the body
 *   multipartParts: [{ name, schema, required, example }] for multipart bodies
 */
function createRequestBody({
    contentType = 'application/json',
    schema = null,
    required = true,
    example,
    multipartParts = null,
}) {
    return { contentType, schema, required, example, multipartParts };
}

function createResponse({ status, description = '', contentType = null, schema = null, example }) {
    return { status, description, contentType, schema, example };
}

module.exports = {
    createIR,
    createEndpoint,
    createParameter,
    createRequestBody,
    createResponse,
};
