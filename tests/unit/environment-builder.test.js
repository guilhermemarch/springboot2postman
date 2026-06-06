const { buildEnvironment } = require('../../core/postman/environment-builder');

describe('environment-builder', () => {
    test('builds postman environment with baseUrl and token', () => {
        const env = buildEnvironment({
            name: 'Test Environment',
            baseUrl: 'http://localhost:8080/app',
        });

        expect(env.name).toBe('Test Environment');
        expect(env.values.find((v) => v.key === 'baseUrl').value).toBe('http://localhost:8080/app');
        expect(env.values.find((v) => v.key === 'token').value).toBe('<JWT_TOKEN_HERE>');
        expect(env._postman_variable_scope).toBe('environment');
    });
});
