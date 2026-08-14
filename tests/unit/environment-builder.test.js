const { buildEnvironment } = require('../../core/postman/environment-builder');

describe('environment-builder', () => {
    test('mirrors all collection variables (v1: path vars were missing)', () => {
        const collection = {
            variable: [
                { key: 'baseUrl', value: 'http://localhost:8080/app' },
                { key: 'token', value: '' },
            ],
        };

        const env = buildEnvironment({ name: 'API Environment', collection });

        expect(env.name).toBe('API Environment');
        expect(env._postman_variable_scope).toBe('environment');
        expect(env.id).toBeDefined();

        const keys = env.values.map((v) => v.key);
        expect(keys).toEqual(['baseUrl', 'token']);
        expect(env.values.find((v) => v.key === 'baseUrl').value).toBe(
            'http://localhost:8080/app',
        );
    });

    test('secret-ish variables are typed as secret', () => {
        const env = buildEnvironment({
            collection: { variable: [{ key: 'token', value: '' }, { key: 'apiKey', value: '' }] },
        });
        expect(env.values.find((v) => v.key === 'token').type).toBe('secret');
        expect(env.values.find((v) => v.key === 'apiKey').type).toBe('secret');
    });

    test('explicit baseUrl overrides the collection value', () => {
        const env = buildEnvironment({
            collection: { variable: [{ key: 'baseUrl', value: 'http://localhost:8080' }] },
            baseUrl: 'https://staging.example.com',
        });
        expect(env.values.find((v) => v.key === 'baseUrl').value).toBe(
            'https://staging.example.com',
        );
    });

    test('falls back to a baseUrl when the collection has no variables', () => {
        const env = buildEnvironment({});
        expect(env.values.find((v) => v.key === 'baseUrl')).toBeDefined();
    });
});
