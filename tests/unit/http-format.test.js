const { renderHttpFile } = require('../../core/output/http-format');
const ExampleGenerator = require('../../core/generator/mock-generator');

const logger = { debug: () => {} };

describe('http-format', () => {
    test('renders requests with base url variable, path values and bodies', () => {
        const spec = {
            servers: [{ url: 'http://localhost:8081/orders' }],
            components: { schemas: {} },
            paths: {
                '/api/v1/orders/{orderId}': {
                    get: {
                        summary: 'Get order',
                        parameters: [
                            {
                                name: 'orderId',
                                in: 'path',
                                required: true,
                                schema: { type: 'string', format: 'uuid' },
                                example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
                            },
                        ],
                        responses: { 200: { description: 'OK' } },
                    },
                },
                '/api/v1/orders': {
                    post: {
                        summary: 'Create order',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: { type: 'object' },
                                    example: { note: 'hello' },
                                },
                            },
                        },
                        responses: { 201: { description: 'Created' } },
                    },
                },
            },
        };

        const examples = new ExampleGenerator(logger);
        examples.setSeed(1);
        const output = renderHttpFile(spec, examples);

        expect(output).toContain('@baseUrl = http://localhost:8081/orders');
        expect(output).toContain('### Get order');
        expect(output).toContain(
            'GET {{baseUrl}}/api/v1/orders/3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        );
        expect(output).toContain('### Create order');
        expect(output).toContain('POST {{baseUrl}}/api/v1/orders');
        expect(output).toContain('Content-Type: application/json');
        expect(output).toContain('"note": "hello"');
    });

    test('only required or defaulted query params are included', () => {
        const spec = {
            servers: [{ url: 'http://localhost' }],
            paths: {
                '/search': {
                    get: {
                        summary: 'Search',
                        parameters: [
                            {
                                name: 'q',
                                in: 'query',
                                required: true,
                                schema: { type: 'string' },
                                example: 'abc',
                            },
                            {
                                name: 'page',
                                in: 'query',
                                required: false,
                                schema: { type: 'integer', default: 0 },
                            },
                            {
                                name: 'noise',
                                in: 'query',
                                required: false,
                                schema: { type: 'string' },
                            },
                        ],
                        responses: { 200: { description: 'OK' } },
                    },
                },
            },
        };

        const examples = new ExampleGenerator(logger);
        examples.setSeed(1);
        const output = renderHttpFile(spec, examples);

        expect(output).toContain('q=abc');
        expect(output).toContain('page=0');
        expect(output).not.toContain('noise=');
    });
});
