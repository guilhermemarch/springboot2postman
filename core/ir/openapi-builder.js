const REASON_PHRASES = {
    100: 'Continue',
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    203: 'Non-Authoritative Information',
    204: 'No Content',
    205: 'Reset Content',
    206: 'Partial Content',
    301: 'Moved Permanently',
    302: 'Found',
    303: 'See Other',
    304: 'Not Modified',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    412: 'Precondition Failed',
    413: 'Payload Too Large',
    415: 'Unsupported Media Type',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
};

const NO_BODY_STATUSES = new Set([204, 205, 304]);

class OpenApiBuilder {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Build a valid OpenAPI 3.0.3 document from the IR.
     * Path+method collisions are recorded on the report and skipped instead
     * of silently overwriting the earlier operation.
     */
    buildFromIR(ir, report = null) {
        this.logger.debug('Building OpenAPI from IR...');

        const info = {
            title: ir.title,
            version: ir.version,
        };
        if (ir.description) {
            info.description = ir.description;
        }

        const spec = {
            openapi: '3.0.3',
            info,
            paths: {},
        };

        if (ir.serverUrl) {
            spec.servers = [{ url: ir.serverUrl }];
        }

        const tagNames = [];
        const usedOperationIds = new Map();

        for (const endpoint of ir.endpoints) {
            const path = endpoint.path || '/';
            const method = endpoint.method.toLowerCase();

            if (!spec.paths[path]) {
                spec.paths[path] = {};
            }

            if (spec.paths[path][method]) {
                if (report) {
                    report.addCollision(method, path, `"${endpoint.name}"`);
                } else {
                    this.logger.warn(`Duplicate mapping ${method.toUpperCase()} ${path}, skipped`);
                }
                continue;
            }

            for (const tag of endpoint.tags || []) {
                if (!tagNames.includes(tag)) {
                    tagNames.push(tag);
                }
            }

            spec.paths[path][method] = this.buildOperation(endpoint, usedOperationIds);
        }

        if (tagNames.length > 0) {
            spec.tags = tagNames.map((name) => ({ name }));
        }

        if (ir.schemas && Object.keys(ir.schemas).length > 0) {
            spec.components = { schemas: ir.schemas };
        }

        this.logger.debug(`Built OpenAPI spec with ${ir.endpoints.length} endpoint(s)`);
        return spec;
    }

    buildOperation(endpoint, usedOperationIds) {
        const operation = {
            summary: endpoint.name,
        };

        if (endpoint.tags && endpoint.tags.length > 0) {
            operation.tags = endpoint.tags;
        }

        operation.operationId = this.uniqueOperationId(
            endpoint.operationId || this.defaultOperationId(endpoint),
            usedOperationIds,
        );

        if (endpoint.description) {
            operation.description = endpoint.description;
        }

        if (endpoint.deprecated) {
            operation.deprecated = true;
        }

        const parameters = [];
        for (const location of ['path', 'query', 'header', 'cookie']) {
            for (const param of endpoint.parameters[location] || []) {
                parameters.push(this.buildParameter(param, location));
            }
        }
        if (parameters.length > 0) {
            operation.parameters = parameters;
        }

        if (endpoint.requestBody) {
            operation.requestBody = this.buildRequestBody(endpoint.requestBody);
        }

        operation.responses = this.buildResponses(endpoint.responses);

        return operation;
    }

    defaultOperationId(endpoint) {
        const slug = endpoint.path.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
        return `${endpoint.method.toLowerCase()}${slug}`.replace(/_+$/, '');
    }

    uniqueOperationId(base, used) {
        const count = used.get(base) || 0;
        used.set(base, count + 1);
        return count === 0 ? base : `${base}_${count + 1}`;
    }

    buildParameter(param, location) {
        const schema = param.schema ? { ...param.schema } : { type: 'string' };
        if (param.defaultValue !== undefined && !schema.$ref) {
            schema.default = coerceToSchemaType(param.defaultValue, schema);
        }

        const parameter = {
            name: param.name,
            in: location,
            required: location === 'path' ? true : Boolean(param.required),
            schema,
        };

        if (param.description) {
            parameter.description = param.description;
        }

        if (param.example !== undefined) {
            parameter.example = param.example;
        }

        return parameter;
    }

    buildRequestBody(requestBody) {
        const contentType = requestBody.contentType || 'application/json';

        let schema = requestBody.schema;
        if (requestBody.multipartParts) {
            const properties = {};
            const required = [];
            for (const part of requestBody.multipartParts) {
                properties[part.name] = part.schema || { type: 'string' };
                if (part.required) {
                    required.push(part.name);
                }
            }
            schema = { type: 'object', properties };
            if (required.length > 0) {
                schema.required = required;
            }
        }

        const media = {};
        if (schema) {
            media.schema = schema;
        }
        if (requestBody.example !== undefined && requestBody.example !== null) {
            media.example = requestBody.example;
        }

        return {
            required: Boolean(requestBody.required),
            content: { [contentType]: media },
        };
    }

    buildResponses(responses) {
        const result = {};

        for (const response of responses || []) {
            const statusCode = String(response.status);
            const entry = {
                description:
                    response.description ||
                    REASON_PHRASES[response.status] ||
                    'Response',
            };

            const hasBody =
                response.schema && !NO_BODY_STATUSES.has(response.status);

            if (hasBody) {
                const mediaType = response.contentType || 'application/json';
                const media = { schema: response.schema };
                if (response.example !== undefined && response.example !== null) {
                    media.example = response.example;
                }
                entry.content = { [mediaType]: media };
            }

            result[statusCode] = entry;
        }

        if (Object.keys(result).length === 0) {
            result['200'] = { description: 'OK' };
        }

        return result;
    }
}

/**
 * Annotation attributes arrive as strings (`defaultValue = "10"`); align the
 * default with the declared schema type so the spec stays valid.
 */
function coerceToSchemaType(value, schema) {
    if (typeof value !== 'string') {
        return value;
    }
    if (schema.type === 'integer' || schema.type === 'number') {
        const numeric = Number(value);
        return Number.isNaN(numeric) ? value : numeric;
    }
    if (schema.type === 'boolean') {
        if (value === 'true') return true;
        if (value === 'false') return false;
    }
    return value;
}

module.exports = OpenApiBuilder;
module.exports.REASON_PHRASES = REASON_PHRASES;
