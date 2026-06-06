const path = require('path');
const ParserStrategy = require('../../core/strategies/parser-strategy');
const Logger = require('../../lib/logger');
const { snapshotCollectionStructure } = require('../helpers/snapshot');

const fixtureRoot = path.join(__dirname, '../fixtures/spring-app');

describe('ParserStrategy integration', () => {
    const logger = new Logger(false);
    const strategy = new ParserStrategy(fixtureRoot, logger);

    test('validates fixture project', async () => {
        expect(await strategy.validate()).toBe(true);
    });

    test('generates postman collection with schemas and endpoints', async () => {
        const collection = await strategy.extract({
            format: 'postman',
            seed: 42,
            enhance: true,
        });

        expect(collection.info.name).toBe('User API');
        expect(collection.variable.find((v) => v.key === 'baseUrl').value).toBe(
            'http://localhost:8080/app',
        );

        const endpointCount = countRequests(collection.item);
        expect(endpointCount).toBeGreaterThanOrEqual(6);
        expect(snapshotCollectionStructure(collection)).toMatchSnapshot();
    });

    test('generates openapi output with populated schemas', async () => {
        const spec = await strategy.extract({
            format: 'openapi',
            seed: 42,
        });

        expect(spec.openapi).toBe('3.0.0');
        expect(spec.info.title).toBe('User API');
        expect(spec.components.schemas.UserDTO).toBeDefined();
        expect(spec.components.schemas.UserDTO.properties.email).toBeDefined();
        expect(countOpenApiEndpoints(spec)).toBeGreaterThanOrEqual(6);
    });
});

function countOpenApiEndpoints(spec) {
    return Object.values(spec.paths).reduce((count, pathItem) => {
        return (
            count +
            ['get', 'post', 'put', 'patch', 'delete'].filter((method) => pathItem[method]).length
        );
    }, 0);
}

function countRequests(items = []) {
    return items.reduce((count, item) => {
        if (item.request) {
            return count + 1;
        }
        if (item.item) {
            return count + countRequests(item.item);
        }
        return count;
    }, 0);
}
