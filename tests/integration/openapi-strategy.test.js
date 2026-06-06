const path = require('path');
const OpenApiStrategy = require('../../core/strategies/openapi-strategy');
const Logger = require('../../lib/logger');

const specPath = path.join(__dirname, '../fixtures/openapi/minimal-openapi.json');

describe('OpenApiStrategy integration', () => {
    const logger = new Logger(false);
    const strategy = new OpenApiStrategy(specPath, logger);

    test('validates openapi fixture', async () => {
        expect(await strategy.validate()).toBe(true);
    });

    test('converts openapi to enhanced postman collection', async () => {
        const collection = await strategy.extract({
            format: 'postman',
            seed: 42,
            enhance: true,
        });

        expect(collection.info.name).toBe('Minimal API');
        expect(collection.variable.find((v) => v.key === 'baseUrl')).toBeDefined();
        expect(collection.variable.find((v) => v.key === 'token')).toBeDefined();
    });

    test('returns raw openapi when format is openapi', async () => {
        const spec = await strategy.extract({ format: 'openapi' });
        expect(spec.info.title).toBe('Minimal API');
        expect(spec.paths['/ping']).toBeDefined();
    });
});
