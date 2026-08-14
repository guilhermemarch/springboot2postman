/**
 * Structural invariants for generated outputs. Each one exists because the
 * v1 audit found real output violating it.
 */

const NO_BODY_STATUSES = new Set(['204', '205', '304']);

function collectRefs(node, refs = []) {
    if (!node || typeof node !== 'object') {
        return refs;
    }
    if (typeof node.$ref === 'string') {
        refs.push(node.$ref);
    }
    for (const value of Object.values(node)) {
        if (typeof value === 'object') {
            collectRefs(value, refs);
        }
    }
    return refs;
}

function collectArraySchemas(node, out = []) {
    if (!node || typeof node !== 'object') {
        return out;
    }
    if (node.type === 'array') {
        out.push(node);
    }
    for (const value of Object.values(node)) {
        if (typeof value === 'object') {
            collectArraySchemas(value, out);
        }
    }
    return out;
}

/**
 * Throws with a descriptive message when the OpenAPI document violates any
 * invariant.
 */
function assertOpenApiInvariants(spec) {
    if (!String(spec.openapi).startsWith('3.')) {
        throw new Error(`Expected OpenAPI 3.x, got ${spec.openapi}`);
    }

    const schemas = spec.components?.schemas || {};

    // 1. Every $ref resolves and contains no generic syntax (List<X> etc).
    for (const ref of collectRefs(spec)) {
        if (!/^#\/components\/schemas\/[A-Za-z0-9_.]+$/.test(ref)) {
            throw new Error(`Malformed $ref: ${ref}`);
        }
        const name = ref.split('/').pop();
        if (!schemas[name]) {
            throw new Error(`$ref points to missing schema: ${ref}`);
        }
    }

    // 2. Every array schema declares items.
    for (const arraySchema of collectArraySchemas(spec)) {
        if (arraySchema.items === undefined) {
            throw new Error(
                `Array schema without items: ${JSON.stringify(arraySchema).slice(0, 120)}`,
            );
        }
    }

    const operationIds = new Set();

    for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
        for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
            const operation = pathItem[method];
            if (!operation) {
                continue;
            }
            const where = `${method.toUpperCase()} ${pathKey}`;

            // 3. Unique operationIds.
            if (operation.operationId) {
                if (operationIds.has(operation.operationId)) {
                    throw new Error(`Duplicate operationId: ${operation.operationId}`);
                }
                operationIds.add(operation.operationId);
            }

            // 4. Parameter sanity: unique name+in, path params required,
            //    every {var} in the path template is declared.
            const seenParams = new Set();
            const pathParamNames = new Set();
            for (const param of operation.parameters || []) {
                const key = `${param.in}:${param.name}`;
                if (seenParams.has(key)) {
                    throw new Error(`Duplicate parameter ${key} at ${where}`);
                }
                seenParams.add(key);
                if (param.in === 'path') {
                    pathParamNames.add(param.name);
                    if (param.required !== true) {
                        throw new Error(`Path parameter ${param.name} not required at ${where}`);
                    }
                }
                if (!param.schema) {
                    throw new Error(`Parameter ${key} without schema at ${where}`);
                }
            }
            for (const match of pathKey.matchAll(/\{(\w+)\}/g)) {
                if (!pathParamNames.has(match[1])) {
                    throw new Error(`Path variable {${match[1]}} undeclared at ${where}`);
                }
            }

            // 5. No content on bodyless statuses (204 with a JSON body was a
            //    v1 bug).
            for (const [status, response] of Object.entries(operation.responses || {})) {
                if (NO_BODY_STATUSES.has(status) && response.content) {
                    throw new Error(`Status ${status} must not declare content at ${where}`);
                }
                if (!response.description) {
                    throw new Error(`Response ${status} without description at ${where}`);
                }
            }
        }
    }

    return true;
}

/**
 * Postman collection invariants.
 */
function assertCollectionInvariants(collection) {
    if (!collection.info?.schema?.includes('v2.1')) {
        throw new Error('Collection is not Postman v2.1');
    }

    const declaredVariables = new Set((collection.variable || []).map((v) => v.key));
    const problems = [];

    const checkVariableRefs = (text, where) => {
        for (const match of String(text).matchAll(/\{\{([^}]+)\}\}/g)) {
            const name = match[1];
            // Postman dynamic variables ($guid etc.) are always defined.
            if (name.startsWith('$')) {
                continue;
            }
            if (!declaredVariables.has(name)) {
                problems.push(`{{${name}}} used at ${where} but not declared as a variable`);
            }
        }
    };

    const visit = (items, folder = '(root)') => {
        const namesInFolder = new Set();

        for (const item of items || []) {
            if (item.item) {
                visit(item.item, item.name);
                continue;
            }
            if (!item.request) {
                continue;
            }

            const where = `${folder} > ${item.name}`;

            if (!item.name || !item.name.trim()) {
                problems.push(`Unnamed request in ${folder}`);
            }
            if (/\s{2,}/.test(item.name)) {
                problems.push(`Double space in request name: "${item.name}"`);
            }
            const nameKey = `${item.request.method} ${item.name}`;
            if (namesInFolder.has(nameKey)) {
                problems.push(`Duplicate request "${nameKey}" in folder ${folder}`);
            }
            namesInFolder.add(nameKey);

            const url = item.request.url;
            if (typeof url === 'string') {
                checkVariableRefs(url, where);
            } else if (url) {
                checkVariableRefs((url.host || []).join('.'), where);
                checkVariableRefs((url.path || []).join('/'), where);
                if (url.raw) {
                    checkVariableRefs(url.raw, where);
                }
            }
        }
    };

    visit(collection.item);

    if (problems.length > 0) {
        throw new Error(`Collection invariant violations:\n- ${problems.join('\n- ')}`);
    }

    return true;
}

module.exports = { assertOpenApiInvariants, assertCollectionInvariants };
