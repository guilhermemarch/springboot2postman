class PostmanEnhancer {
    constructor(logger, mockGenerator) {
        this.logger = logger;
        this.mockGenerator = mockGenerator;
        this.collectionVariables = new Map();
    }

    enhance(collection, _options = {}) {
        this.logger.debug('Enhancing Postman collection...');

        collection = this.addDefaultVariables(collection);
        collection = this.addDefaultHeaders(collection);
        collection = this.convertPathVariables(collection);
        collection = this.improveRequestNames(collection);
        collection = this.sortRequests(collection);
        collection = this.addSavedResponses(collection);

        return collection;
    }

    addDefaultVariables(collection) {
        if (!collection.variable) {
            collection.variable = [];
        }

        const defaultVars = [
            { key: 'baseUrl', value: 'http://localhost:8080', type: 'string' },
            { key: 'token', value: '<JWT_TOKEN_HERE>', type: 'string' },
        ];

        for (const { key, value, type } of defaultVars) {
            if (!collection.variable.find(v => v.key === key)) {
                collection.variable.push({ key, value, type });
            }
        }

        for (const [key, value] of this.collectionVariables) {
            if (!collection.variable.find(v => v.key === key)) {
                collection.variable.push({ key, value, type: 'string' });
            }
        }

        return collection;
    }

    addDefaultHeaders(collection) {
        const processItems = (items) => {
            for (const item of items) {
                if (item.item) {
                    processItems(item.item);
                } else if (item.request) {
                    item.request.header = item.request.header || [];

                    if (!item.request.header.find(h => h.key === 'Accept')) {
                        item.request.header.push({
                            key: 'Accept',
                            value: 'application/json',
                            type: 'text',
                        });
                    }

                    if (item.request.body && !item.request.header.find(h => h.key === 'Content-Type')) {
                        item.request.header.push({
                            key: 'Content-Type',
                            value: 'application/json',
                            type: 'text',
                        });
                    }

                    if (!item.request.header.find(h => h.key === 'Authorization')) {
                        item.request.header.push({
                            key: 'Authorization',
                            value: 'Bearer {{token}}',
                            type: 'text',
                            disabled: true,
                        });
                    }
                }
            }
        };

        if (collection.item) {
            processItems(collection.item);
        }

        return collection;
    }

    convertPathVariables(collection) {
        const processItems = (items) => {
            for (const item of items) {
                if (item.item) {
                    processItems(item.item);
                } else if (item.request && item.request.url) {
                    this.processUrlVariables(item.request.url, item.name);
                }
            }
        };

        if (collection.item) {
            processItems(collection.item);
        }

        return collection;
    }

    processUrlVariables(url, requestName) {
        if (!url.path) return;

        const variableMapping = {
            'id': this.guessVariableNameFromContext(requestName),
            'userId': 'userId',
            'productId': 'productId',
            'orderId': 'orderId',
        };

        for (let i = 0; i < url.path.length; i++) {
            const segment = url.path[i];

            if (typeof segment === 'string' && segment.startsWith(':')) {
                const paramName = segment.substring(1);
                const varName = variableMapping[paramName] || `${paramName}`;

                url.path[i] = `{{${varName}}}`;

                if (!this.collectionVariables.has(varName)) {
                    this.collectionVariables.set(varName, '1');
                }
            }
        }

        if (url.variable) {
            for (const variable of url.variable) {
                const varName = variableMapping[variable.key] || variable.key;
                variable.value = `{{${varName}}}`;

                if (!this.collectionVariables.has(varName)) {
                    this.collectionVariables.set(varName, '1');
                }
            }
        }
    }

    guessVariableNameFromContext(requestName) {
        const lowerName = requestName.toLowerCase();

        if (lowerName.includes('user')) return 'userId';
        if (lowerName.includes('product')) return 'productId';
        if (lowerName.includes('order')) return 'orderId';
        if (lowerName.includes('customer')) return 'customerId';
        if (lowerName.includes('item')) return 'itemId';

        return 'id';
    }

    improveRequestNames(collection) {
        const processItems = (items) => {
            for (const item of items) {
                if (item.item) {
                    processItems(item.item);
                } else if (item.name) {
                    item.name = this.improveRequestName(item.name, item.request?.method);
                }
            }
        };

        if (collection.item) {
            processItems(collection.item);
        }

        return collection;
    }

    improveRequestName(name, method) {
        let improved = name
            .replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/i, '')
            .replace(/([A-Z])/g, ' $1')
            .trim();

        improved = improved.charAt(0).toUpperCase() + improved.slice(1);

        const lowerName = improved.toLowerCase();

        if (method === 'GET' && lowerName.includes('all')) {
            improved = `List ${improved.replace(/all\s*/i, '')}`.trim();
        }

        if (method === 'GET' && lowerName.includes('by id')) {
            improved = improved.replace(/by id/i, 'by ID');
        }

        return improved;
    }

    sortRequests(collection) {
        const methodOrder = { 'GET': 1, 'POST': 2, 'PUT': 3, 'PATCH': 4, 'DELETE': 5 };

        const sortItems = (items) => {
            for (const item of items) {
                if (item.item && item.item.length > 0) {
                    item.item.sort((a, b) => {
                        if (a.item) return -1;
                        if (b.item) return 1;

                        const methodA = a.request?.method || 'GET';
                        const methodB = b.request?.method || 'GET';

                        const orderA = methodOrder[methodA] || 99;
                        const orderB = methodOrder[methodB] || 99;

                        if (orderA !== orderB) return orderA - orderB;

                        const isListA = a.name?.toLowerCase().includes('list') ||
                            a.name?.toLowerCase().includes('all');
                        const isListB = b.name?.toLowerCase().includes('list') ||
                            b.name?.toLowerCase().includes('all');

                        if (isListA && !isListB) return -1;
                        if (!isListA && isListB) return 1;

                        return 0;
                    });

                    sortItems(item.item);
                }
            }
        };

        if (collection.item) {
            sortItems(collection.item);
        }

        return collection;
    }

    addSavedResponses(collection) {
        const processItems = (items) => {
            for (const item of items) {
                if (item.item) {
                    processItems(item.item);
                } else if (item.request) {
                    item.response = item.response || [];

                    const method = item.request.method;
                    const path = this.getPathFromUrl(item.request.url);
                    const entityName = this.guessEntityName(item.name);

                    const responses = this.generateResponses(method, path, entityName);

                    for (const response of responses) {
                        if (!item.response.find(r => r.name === response.name)) {
                            item.response.push(response);
                        }
                    }
                }
            }
        };

        if (collection.item) {
            processItems(collection.item);
        }

        return collection;
    }

    getPathFromUrl(url) {
        if (!url) return '/';
        if (typeof url === 'string') return url;
        if (url.path) return `/${url.path.join('/')}`;
        return '/';
    }

    guessEntityName(requestName) {
        const words = requestName.split(/\s+/);
        for (const word of words) {
            if (word.length > 2 && !['by', 'ID', 'the', 'Get', 'Create', 'Update', 'Delete', 'List'].includes(word)) {
                return word;
            }
        }
        return 'Entity';
    }

    generateResponses(method, path, entityName) {
        const responses = [];
        const successExample = this.mockGenerator.generateResponseExample(entityName, null, method);
        const listExample = this.mockGenerator.generateListResponse(entityName, null, 3);
        const errorExample = this.mockGenerator.generateErrorResponse(400, 'Validation failed', path);
        const notFoundExample = this.mockGenerator.generateErrorResponse(404, `${entityName} not found`, path);

        switch (method) {
            case 'GET':
                if (path.includes(':') || path.includes('{{')) {
                    responses.push(this.createSavedResponse('200 OK', 200, successExample));
                    responses.push(this.createSavedResponse('404 Not Found', 404, notFoundExample));
                } else {
                    responses.push(this.createSavedResponse('200 OK', 200, listExample));
                }
                break;

            case 'POST':
                responses.push(this.createSavedResponse('201 Created', 201, successExample));
                responses.push(this.createSavedResponse('400 Bad Request', 400, errorExample));
                break;

            case 'PUT':
            case 'PATCH':
                responses.push(this.createSavedResponse('200 OK', 200, successExample));
                responses.push(this.createSavedResponse('400 Bad Request', 400, errorExample));
                responses.push(this.createSavedResponse('404 Not Found', 404, notFoundExample));
                break;

            case 'DELETE':
                responses.push(this.createSavedResponse('204 No Content', 204, null));
                responses.push(this.createSavedResponse('404 Not Found', 404, notFoundExample));
                break;
        }

        return responses;
    }

    createSavedResponse(name, status, body) {
        const response = {
            name,
            status,
            code: status,
            _postman_previewlanguage: 'json',
            header: [
                { key: 'Content-Type', value: 'application/json' },
            ],
        };

        if (body !== null) {
            response.body = JSON.stringify(body, null, 2);
        }

        return response;
    }
}

module.exports = PostmanEnhancer;
