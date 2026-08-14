const ExampleGenerator = require('../../core/generator/mock-generator');

const logger = { debug: () => {} };

describe('ExampleGenerator (schema-driven)', () => {
    test('declared type always wins over field name (v1: "statusCode" got a string)', () => {
        const generator = new ExampleGenerator(logger);
        generator.setSeed(1);

        const value = generator.fromSchema({ type: 'integer' }, {}, 'statusCode');
        expect(typeof value).toBe('number');

        const rating = generator.fromSchema({ type: 'number' }, {}, 'rating');
        expect(typeof rating).toBe('number');
    });

    test('enums use real declared values, never invented ones', () => {
        const generator = new ExampleGenerator(logger);
        generator.setSeed(1);
        const value = generator.fromSchema(
            { type: 'string', enum: ['PENDING', 'PAID'] },
            {},
            'status',
        );
        expect(['PENDING', 'PAID']).toContain(value);
    });

    test('formats are honored', () => {
        const generator = new ExampleGenerator(logger);
        generator.setSeed(1);

        expect(generator.fromSchema({ type: 'string', format: 'uuid' }, {})).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(generator.fromSchema({ type: 'string', format: 'email' }, {})).toContain('@');
        expect(generator.fromSchema({ type: 'string', format: 'date' }, {})).toMatch(
            /^\d{4}-\d{2}-\d{2}$/,
        );
        expect(generator.fromSchema({ type: 'string', format: 'date-time' }, {})).toMatch(
            /^\d{4}-\d{2}-\d{2}T.*Z$/,
        );
    });

    test('respects numeric bounds', () => {
        const generator = new ExampleGenerator(logger);
        generator.setSeed(1);
        const value = generator.fromSchema({ type: 'integer', minimum: 5, maximum: 9 }, {});
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThanOrEqual(9);
    });

    test('resolves $refs through the schema registry with cycle safety', () => {
        const generator = new ExampleGenerator(logger);
        generator.setSeed(1);
        const schemas = {
            Category: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    children: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Category' },
                    },
                },
            },
        };

        const value = generator.fromSchema({ $ref: '#/components/schemas/Category' }, schemas);
        expect(value).toHaveProperty('name');
        // Recursion cut, not an infinite loop.
        expect(Array.isArray(value.children)).toBe(true);
    });

    test('seeded output is fully deterministic (v1: --seed changed every run)', () => {
        const schema = {
            type: 'object',
            properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string', format: 'email' },
                createdAt: { type: 'string', format: 'date-time' },
                total: { type: 'number' },
            },
        };

        const first = new ExampleGenerator(logger);
        first.setSeed(42);
        const second = new ExampleGenerator(logger);
        second.setSeed(42);

        expect(first.fromSchema(schema, {})).toEqual(second.fromSchema(schema, {}));
    });

    test('example and default declared in the schema are used as-is', () => {
        const generator = new ExampleGenerator(logger);
        generator.setSeed(1);
        expect(generator.fromSchema({ type: 'string', example: 'fixed' }, {})).toBe('fixed');
        expect(generator.fromSchema({ type: 'integer', default: 20 }, {})).toBe(20);
    });
});
