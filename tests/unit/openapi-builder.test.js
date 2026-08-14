const OpenApiBuilder = require('../../core/ir/openapi-builder');
const RunReport = require('../../core/report/run-report');
const {
    createIR,
    createEndpoint,
    createParameter,
    createRequestBody,
    createResponse,
} = require('../../core/ir/models');
const { assertOpenApiInvariants } = require('../helpers/oas-invariants');

const logger = { debug: () => {}, warn: () => {} };

describe('OpenApiBuilder', () => {
    test('204 responses never declare content (v1 bug A4)', () => {
        const ir = createIR({ title: 'T' });
        const endpoint = createEndpoint({ method: 'DELETE', path: '/x/{id}', name: 'Delete x' });
        endpoint.parameters.path.push(
            createParameter({ name: 'id', location: 'path', schema: { type: 'string' } }),
        );
        endpoint.responses.push(
            createResponse({
                status: 204,
                schema: { type: 'object' },
                contentType: 'application/json',
            }),
        );
        ir.endpoints.push(endpoint);

        const spec = new OpenApiBuilder(logger).buildFromIR(ir);
        expect(spec.paths['/x/{id}'].delete.responses['204'].content).toBeUndefined();
        assertOpenApiInvariants(spec);
    });

    test('collisions are reported and first wins (v1: silent overwrite)', () => {
        const ir = createIR({ title: 'T' });
        const first = createEndpoint({ method: 'GET', path: '/same', name: 'First' });
        first.responses.push(createResponse({ status: 200 }));
        const second = createEndpoint({ method: 'GET', path: '/same', name: 'Second' });
        second.responses.push(createResponse({ status: 200 }));
        ir.endpoints.push(first, second);

        const report = new RunReport();
        const spec = new OpenApiBuilder(logger).buildFromIR(ir, report);

        expect(spec.paths['/same'].get.summary).toBe('First');
        expect(report.collisions).toHaveLength(1);
    });

    test('operationIds are deduplicated', () => {
        const ir = createIR({ title: 'T' });
        for (const path of ['/a', '/b']) {
            const endpoint = createEndpoint({
                method: 'GET',
                path,
                name: 'List',
                operationId: 'list',
            });
            endpoint.responses.push(createResponse({ status: 200 }));
            ir.endpoints.push(endpoint);
        }

        const spec = new OpenApiBuilder(logger).buildFromIR(ir);
        expect(spec.paths['/a'].get.operationId).toBe('list');
        expect(spec.paths['/b'].get.operationId).toBe('list_2');
        assertOpenApiInvariants(spec);
    });

    test('multipart bodies build an object schema from parts', () => {
        const ir = createIR({ title: 'T' });
        const endpoint = createEndpoint({ method: 'POST', path: '/upload', name: 'Upload' });
        endpoint.requestBody = createRequestBody({
            contentType: 'multipart/form-data',
            multipartParts: [
                { name: 'file', schema: { type: 'string', format: 'binary' }, required: true },
                { name: 'note', schema: { type: 'string' }, required: false },
            ],
        });
        endpoint.responses.push(createResponse({ status: 201 }));
        ir.endpoints.push(endpoint);

        const spec = new OpenApiBuilder(logger).buildFromIR(ir);
        const media = spec.paths['/upload'].post.requestBody.content['multipart/form-data'];
        expect(media.schema).toEqual({
            type: 'object',
            properties: {
                file: { type: 'string', format: 'binary' },
                note: { type: 'string' },
            },
            required: ['file'],
        });
        assertOpenApiInvariants(spec);
    });

    test('descriptions default to real reason phrases, not "Successful response" for 404', () => {
        const ir = createIR({ title: 'T' });
        const endpoint = createEndpoint({ method: 'GET', path: '/x', name: 'Get x' });
        endpoint.responses.push(createResponse({ status: 200 }));
        endpoint.responses.push(createResponse({ status: 404 }));
        ir.endpoints.push(endpoint);

        const spec = new OpenApiBuilder(logger).buildFromIR(ir);
        expect(spec.paths['/x'].get.responses['404'].description).toBe('Not Found');
    });
});
