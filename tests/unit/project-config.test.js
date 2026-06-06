const path = require('path');
const { loadProjectConfig } = require('../../core/config/project-config');

const fixtureRoot = path.join(__dirname, '../fixtures/spring-app');

describe('project-config', () => {
    test('reads application.properties', async () => {
        const config = await loadProjectConfig(fixtureRoot);

        expect(config.appName).toBe('User API');
        expect(config.contextPath).toBe('/app');
        expect(config.port).toBe(8080);
        expect(config.baseUrl).toBe('http://localhost:8080/app');
    });
});
