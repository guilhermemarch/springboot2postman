class OpenApiBuilder {
    constructor(logger) {
        this.logger = logger;
    }

    buildFromIR(ir) {
        this.logger.debug('Building OpenAPI from IR...');

        const spec = {
            openapi: '3.0.0',
            info: ir.info,
            servers: ir.servers,
            paths: {},
            components: {
                schemas: ir.schemas || {},
            },
        };

        for (const endpoint of ir.endpoints) {
            const path = endpoint.path;

            if (!spec.paths[path]) {
                spec.paths[path] = {};
            }

            const method = endpoint.method.toLowerCase();
            spec.paths[path][method] = this.buildOperation(endpoint);
        }

        this.logger.debug(`Built OpenAPI spec with ${ir.endpoints.length} endpoints`);
        return spec;
    }

    buildOperation(endpoint) {
        const operation = {
            summary: endpoint.name,
            operationId: endpoint.id,
        };

        if (endpoint.description) {
            operation.description = endpoint.description;
        }

        if (endpoint.tags && endpoint.tags.length > 0) {
            operation.tags = endpoint.tags;
        }

        const parameters = [];

        for (const param of endpoint.parameters.path || []) {
            parameters.push(this.buildParameter(param, 'path'));
        }

        for (const param of endpoint.parameters.query || []) {
            parameters.push(this.buildParameter(param, 'query'));
        }

        for (const param of endpoint.parameters.header || []) {
            parameters.push(this.buildParameter(param, 'header'));
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

    buildParameter(param, inLocation) {
        const parameter = {
            name: param.name,
            in: inLocation,
            required: param.required || false,
            schema: this.buildSchema(param),
        };

        if (param.description) {
            parameter.description = param.description;
        }

        if (param.example !== undefined) {
            parameter.example = param.example;
        }

        if (param.defaultValue !== undefined) {
            parameter.schema.default = param.defaultValue;
        }

        return parameter;
    }

    buildSchema(param) {
        if (param.schema) {
            return param.schema;
        }

        const schema = {
            type: param.jsonType || 'string',
        };

        if (param.format) {
            schema.format = param.format;
        }

        return schema;
    }

    buildRequestBody(requestBody) {
        return {
            required: requestBody.required || false,
            content: {
                [requestBody.contentType || 'application/json']: {
                    schema: requestBody.schema,
                },
            },
        };
    }

    buildResponses(responses) {
        const responsesObj = {};

        for (const response of responses) {
            const statusCode = response.status.toString();

            responsesObj[statusCode] = {
                description: response.description || 'Successful response',
            };

            if (response.schema) {
                responsesObj[statusCode].content = {
                    [response.contentType || 'application/json']: {
                        schema: response.schema,
                    },
                };
            }
        }

        if (Object.keys(responsesObj).length === 0) {
            responsesObj['200'] = {
                description: 'Successful response',
            };
        }

        return responsesObj;
    }

    addSchema(spec, name, schema) {
        if (!spec.components) {
            spec.components = {};
        }
        if (!spec.components.schemas) {
            spec.components.schemas = {};
        }

        spec.components.schemas[name] = schema;
        return spec;
    }
}

module.exports = OpenApiBuilder;
