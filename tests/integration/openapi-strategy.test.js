const path = require('path');
const OpenApiStrategy = require('../../core/strategies/openapi-strategy');
const Logger = require('../../lib/logger');
const { assertCollectionInvariants } = require('../helpers/oas-invariants');

const minimalSpec = path.join(__dirname, '../fixtures/openapi/minimal-openapi.json');
const securedSpec = path.join(__dirname, '../fixtures/openapi/secured-openapi.json');

describe('OpenApiStrategy integration', () => {
    const logger = new Logger(false, true);

    test('validates openapi fixture', async () => {
        const strategy = new OpenApiStrategy(minimalSpec, logger);
        expect(await strategy.validate()).toBe(true);
    });

    test('converts to Postman without inventing auth (no securitySchemes)', async () => {
        const strategy = new OpenApiStrategy(minimalSpec, logger);
        const { output: collection, report } = await strategy.extract({
            format: 'postman',
            seed: 42,
            enhance: true,
        });

        expect(collection.info.name).toBe('Minimal API');
        expect(collection.variable.find((v) => v.key === 'baseUrl')).toBeDefined();
        // Honest: this API declares no auth, so none is added.
        expect(collection.auth).toBeUndefined();
        expect(collection.variable.find((v) => v.key === 'token')).toBeUndefined();

        expect(report.strategy).toBe('openapi');
        expect(report.endpoints).toBe(1);
        assertCollectionInvariants(collection);
    });

    test('derives collection auth from securitySchemes when declared', async () => {
        const strategy = new OpenApiStrategy(securedSpec, logger);
        const { output: collection } = await strategy.extract({
            format: 'postman',
            seed: 42,
            enhance: true,
        });

        expect(collection.auth?.type).toBe('bearer');
        expect(collection.variable.find((v) => v.key === 'token')).toBeDefined();
        expect(collection.info.description).toContain('bearer');
    });

    test('returns raw openapi when format is openapi', async () => {
        const strategy = new OpenApiStrategy(minimalSpec, logger);
        const { output: spec } = await strategy.extract({ format: 'openapi' });
        expect(spec.info.title).toBe('Minimal API');
        expect(spec.paths['/ping']).toBeDefined();
    });

    test('validate() caches the spec so extract() does not re-fetch', async () => {
        const strategy = new OpenApiStrategy(minimalSpec, logger);
        await strategy.validate();

        let fetches = 0;
        const originalFetch = strategy.fetcher.fetch.bind(strategy.fetcher);
        strategy.fetcher.fetch = async (...args) => {
            fetches++;
            return originalFetch(...args);
        };

        await strategy.extract({ format: 'openapi' });
        expect(fetches).toBe(0);
    });
});
