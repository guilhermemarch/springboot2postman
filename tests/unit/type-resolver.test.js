const TypeResolver = require('../../core/parser/type-resolver');
const Logger = require('../../lib/logger');

describe('TypeResolver', () => {
    const resolver = new TypeResolver(new Logger(false));

    test('resolves primitives', () => {
        expect(resolver.resolveType('String')).toEqual({ type: 'string' });
        expect(resolver.resolveType('Long')).toEqual({ type: 'integer', format: 'int64' });
    });

    test('resolves generic collections', () => {
        expect(resolver.resolveType('List<User>')).toEqual({
            type: 'array',
            items: { $ref: '#/components/schemas/User' },
        });
    });

    test('unwraps ResponseEntity', () => {
        expect(resolver.resolveType('ResponseEntity<User>')).toEqual({
            $ref: '#/components/schemas/User',
        });
    });

    test('detects custom types needing schemas', () => {
        expect(resolver.needsSchema('UserDTO')).toBe(true);
        expect(resolver.needsSchema('String')).toBe(false);
    });
});
