const path = require('path');
const { loadProjectConfig } = require('../../core/config/project-config');

describe('project-config', () => {
    test('reads application.properties', async () => {
        const config = await loadProjectConfig(path.join(__dirname, '../fixtures/spring-app'));

        expect(config.appName).toBe('User API');
        expect(config.contextPath).toBe('/app');
        expect(config.port).toBe(8080);
        expect(config.baseUrl).toBe('http://localhost:8080/app');
    });

    test('reads multi-document YAML using the default-profile document (v1 bug H8)', async () => {
        const config = await loadProjectConfig(
            path.join(__dirname, '../fixtures/shop-api/order-service'),
        );

        expect(config.appName).toBe('Order Service');
        expect(config.contextPath).toBe('/orders');
        // First document wins; the prod profile (port 80) must not leak.
        expect(config.port).toBe(8081);
        expect(config.baseUrl).toBe('http://localhost:8081/orders');
    });

    test('finds config in multi-module layouts', async () => {
        const config = await loadProjectConfig(path.join(__dirname, '../fixtures/shop-api'));
        expect(config.appName).toBe('Order Service');
    });

    test('falls back to defaults when nothing is found', async () => {
        const config = await loadProjectConfig(path.join(__dirname, '../fixtures'));
        expect(config.baseUrl).toBe('http://localhost:8080');
    });
});
