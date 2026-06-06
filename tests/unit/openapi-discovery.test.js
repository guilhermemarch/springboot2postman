const path = require('path');
const { findOpenApiSpec, isOpenApiFile } = require('../../core/openapi/discovery');

describe('openapi-discovery', () => {
    test('detects openapi file path directly', async () => {
        const specPath = path.join(__dirname, '../fixtures/openapi/minimal-openapi.json');
        expect(isOpenApiFile(specPath)).toBe(true);
        expect(await findOpenApiSpec(specPath)).toBe(specPath);
    });

    test('finds openapi file inside project tree', async () => {
        const resourcesDir = path.join(__dirname, '../fixtures/spring-app-with-spec');
        const specPath = path.join(resourcesDir, 'src/main/resources/openapi.json');
        expect(await findOpenApiSpec(resourcesDir)).toBe(specPath);
    });
});
