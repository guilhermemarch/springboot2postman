/**
 * Render an OpenAPI spec as a .http file compatible with the IntelliJ HTTP
 * Client and the VS Code REST Client extension.
 */

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function renderHttpFile(spec, examples) {
    const lines = [];
    const baseUrl = spec.servers?.[0]?.url || 'http://localhost:8080';
    const schemas = spec.components?.schemas || {};

    lines.push(`@baseUrl = ${baseUrl}`);
    lines.push('');

    for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
        for (const method of HTTP_METHODS) {
            const operation = pathItem[method];
            if (!operation) {
                continue;
            }
            lines.push(...renderRequest(method, pathKey, operation, schemas, examples));
            lines.push('');
        }
    }

    return `${lines.join('\n').trimEnd()}\n`;
}

function renderRequest(method, pathKey, operation, schemas, examples) {
    const lines = [];

    const title = operation.summary || `${method.toUpperCase()} ${pathKey}`;
    lines.push(`### ${title}${operation.deprecated ? ' (deprecated)' : ''}`);

    const parameters = operation.parameters || [];

    let renderedPath = pathKey;
    for (const param of parameters.filter((p) => p.in === 'path')) {
        const value = parameterValue(param, schemas, examples);
        renderedPath = renderedPath.replace(`{${param.name}}`, encodeURIComponent(String(value)));
    }

    const queryParts = [];
    for (const param of parameters.filter((p) => p.in === 'query')) {
        if (!param.required && param.schema?.default === undefined) {
            continue;
        }
        const value =
            param.schema?.default !== undefined
                ? param.schema.default
                : parameterValue(param, schemas, examples);
        queryParts.push(`${param.name}=${encodeURIComponent(String(value))}`);
    }

    const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    lines.push(`${method.toUpperCase()} {{baseUrl}}${renderedPath}${query}`);

    for (const param of parameters.filter((p) => p.in === 'header')) {
        if (!param.required) {
            continue;
        }
        const value = parameterValue(param, schemas, examples);
        lines.push(`${param.name}: ${value}`);
    }

    const body = renderBody(operation, schemas, examples);
    if (body) {
        lines.push(`Content-Type: ${body.contentType}`);
        lines.push('');
        lines.push(body.text);
    }

    return lines;
}

function parameterValue(param, schemas, examples) {
    if (param.example !== undefined) {
        return param.example;
    }
    const value = examples.fromSchema(param.schema || { type: 'string' }, schemas, param.name);
    return value === null || value === undefined ? 'value' : value;
}

function renderBody(operation, schemas, examples) {
    const content = operation.requestBody?.content;
    if (!content) {
        return null;
    }

    const contentType = Object.keys(content)[0];
    if (!contentType) {
        return null;
    }
    const media = content[contentType];

    if (contentType.startsWith('multipart/')) {
        // .http multipart bodies need explicit boundaries; emit a commented
        // skeleton users can fill in.
        const props = Object.keys(media.schema?.properties || {});
        const text = [
            '# multipart/form-data request - fill in the parts below',
            ...props.map((p) => `# part: ${p}`),
        ].join('\n');
        return { contentType, text };
    }

    const example =
        media.example !== undefined
            ? media.example
            : examples.fromSchema(media.schema, schemas);

    if (example === null || example === undefined) {
        return null;
    }

    const text =
        typeof example === 'string' ? example : JSON.stringify(example, null, 2);

    return { contentType, text };
}

module.exports = { renderHttpFile };
