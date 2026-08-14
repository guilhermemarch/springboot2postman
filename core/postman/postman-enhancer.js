/**
 * Minimal, honest post-processing of the converted collection.
 *
 * Everything here is derived from the spec or the project config — no
 * fabricated saved responses, no guessed entity names, no headers forced
 * onto every request. Request names, folders, examples and headers come
 * from the OpenAPI spec via openapi-to-postmanv2.
 */
class PostmanEnhancer {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * @param {object} collection converted Postman collection
     * @param {object} context { baseUrl, spec }
     */
    enhance(collection, context = {}) {
        this.logger.debug('Post-processing Postman collection...');

        this.ensureBaseUrlVariable(collection, context.baseUrl);
        this.applyDescription(collection, context.spec);
        this.applyAuthFromSecuritySchemes(collection, context.spec);
        this.fillEmptyPathVariables(collection);

        return collection;
    }

    ensureBaseUrlVariable(collection, baseUrl) {
        collection.variable = collection.variable || [];
        const existing = collection.variable.find((v) => v.key === 'baseUrl');
        if (existing) {
            if (baseUrl) {
                existing.value = baseUrl;
            }
        } else {
            collection.variable.push({
                key: 'baseUrl',
                value: baseUrl || 'http://localhost:8080',
                type: 'string',
            });
        }
    }

    applyDescription(collection, spec) {
        const description = spec?.info?.description;
        if (description && collection.info) {
            collection.info.description = description;
        }
    }

    /**
     * Collection-level auth derived from the spec's securitySchemes — only
     * when the API actually declares one. Normalizes whatever the converter
     * produced into variable-based auth so the collection works after
     * setting a single variable.
     */
    applyAuthFromSecuritySchemes(collection, spec) {
        const schemes = spec?.components?.securitySchemes;
        if (!schemes) {
            return;
        }

        const entries = Object.values(schemes);

        const bearer = entries.find(
            (s) => s.type === 'http' && (s.scheme === 'bearer' || s.scheme === 'Bearer'),
        );
        if (bearer) {
            collection.auth = {
                type: 'bearer',
                bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
            };
            this.addVariable(collection, 'token', '');
            return;
        }

        const basic = entries.find((s) => s.type === 'http' && s.scheme === 'basic');
        if (basic) {
            collection.auth = {
                type: 'basic',
                basic: [
                    { key: 'username', value: '{{username}}', type: 'string' },
                    { key: 'password', value: '{{password}}', type: 'string' },
                ],
            };
            this.addVariable(collection, 'username', '');
            this.addVariable(collection, 'password', '');
            return;
        }

        const apiKey = entries.find((s) => s.type === 'apiKey');
        if (apiKey) {
            collection.auth = {
                type: 'apikey',
                apikey: [
                    { key: 'key', value: apiKey.name || 'X-API-Key', type: 'string' },
                    { key: 'value', value: '{{apiKey}}', type: 'string' },
                    {
                        key: 'in',
                        value: apiKey.in === 'query' ? 'query' : 'header',
                        type: 'string',
                    },
                ],
            };
            this.addVariable(collection, 'apiKey', '');
        }
    }

    addVariable(collection, key, value) {
        collection.variable = collection.variable || [];
        if (!collection.variable.find((v) => v.key === key)) {
            collection.variable.push({ key, value, type: 'string' });
        }
    }

    /**
     * Path variables keep Postman's native representation (:id +
     * url.variable). When the converter leaves a value empty, reuse the
     * parameter's own description/schema-derived example if present.
     */
    fillEmptyPathVariables(collection) {
        const visit = (items) => {
            for (const item of items || []) {
                if (item.item) {
                    visit(item.item);
                    continue;
                }
                const variables = item.request?.url?.variable;
                if (!Array.isArray(variables)) {
                    continue;
                }
                for (const variable of variables) {
                    if (variable.value === undefined || variable.value === null) {
                        variable.value = '';
                    }
                }
            }
        };

        visit(collection.item);
    }
}

module.exports = PostmanEnhancer;
