const TypeResolver = require('../../core/parser/type-resolver');
const { applyValidationConstraints } = require('../../core/parser/type-resolver');

function makeResolver() {
    // No source index: only structural/primitive resolution is exercised.
    return new TypeResolver(null, { debug: () => {}, warn: () => {} });
}

function annotation(name, attributes = {}) {
    return { name, attributes, raw: '' };
}

describe('TypeResolver', () => {
    test('ResponseEntity<List<String>> is a single-level array (v1 critical bug C2)', async () => {
        const resolver = makeResolver();
        const schema = await resolver.resolveTypeText('ResponseEntity<List<String>>', null);
        expect(schema).toEqual({ type: 'array', items: { type: 'string' } });
    });

    test('wrappers unwrap before collections in any order', async () => {
        const resolver = makeResolver();
        expect(await resolver.resolveTypeText('Optional<List<Integer>>', null)).toEqual({
            type: 'array',
            items: { type: 'integer', format: 'int32' },
        });
        expect(await resolver.resolveTypeText('CompletableFuture<Set<UUID>>', null)).toEqual({
            type: 'array',
            items: { type: 'string', format: 'uuid' },
        });
    });

    test('Map<String, List<Long>> keeps typed values (v1 ordering bug)', async () => {
        const resolver = makeResolver();
        expect(await resolver.resolveTypeText('Map<String, List<Long>>', null)).toEqual({
            type: 'object',
            additionalProperties: {
                type: 'array',
                items: { type: 'integer', format: 'int64' },
            },
        });
    });

    test('Page<T> resolves to the Spring Data envelope (v1 bug A3)', async () => {
        const resolver = makeResolver();
        const schema = await resolver.resolveTypeText('Page<String>', null);
        expect(schema.type).toBe('object');
        expect(schema.properties.content).toEqual({
            type: 'array',
            items: { type: 'string' },
        });
        expect(schema.properties.totalElements).toBeDefined();
        expect(schema.properties.totalPages).toBeDefined();
    });

    test('Slice<T> has no totals', async () => {
        const resolver = makeResolver();
        const schema = await resolver.resolveTypeText('Slice<String>', null);
        expect(schema.properties.content).toBeDefined();
        expect(schema.properties.totalElements).toBeUndefined();
    });

    test('void and Void produce no content (v1 bug A4: Void ghost schema)', async () => {
        const resolver = makeResolver();
        expect(await resolver.resolveTypeText('void', null)).toBeNull();
        expect(await resolver.resolveTypeText('ResponseEntity<Void>', null)).toBeNull();
        expect(Object.keys(resolver.getSchemas())).toHaveLength(0);
    });

    test('byte[] is base64 string, other arrays are JSON arrays', async () => {
        const resolver = makeResolver();
        expect(await resolver.resolveTypeText('byte[]', null)).toEqual({
            type: 'string',
            format: 'byte',
        });
        expect(await resolver.resolveTypeText('String[]', null)).toEqual({
            type: 'array',
            items: { type: 'string' },
        });
    });

    test('Flux<T> and Stream<T> are arrays', async () => {
        const resolver = makeResolver();
        expect(await resolver.resolveTypeText('Flux<String>', null)).toEqual({
            type: 'array',
            items: { type: 'string' },
        });
    });

    test('MultipartFile is binary', async () => {
        const resolver = makeResolver();
        expect(await resolver.resolveTypeText('MultipartFile', null)).toEqual({
            type: 'string',
            format: 'binary',
        });
    });

    test('unknown types are honest empty objects, reported as unresolved', async () => {
        const resolver = makeResolver();
        const schema = await resolver.resolveTypeText('SomethingUnknown', null, {
            location: 'OrderController.get',
        });
        // Never fabricate fields for unknown types.
        expect(schema).toEqual({ type: 'object' });
        const unresolved = resolver.getUnresolvedTypes();
        expect(unresolved).toHaveLength(1);
        expect(unresolved[0].name).toBe('SomethingUnknown');
        expect(unresolved[0].locations).toEqual(['OrderController.get']);
    });

    test('bare generic type variables are reported, not fabricated', async () => {
        const resolver = makeResolver();
        const schema = await resolver.resolveTypeText('T', null, { location: 'Base.findById' });
        expect(schema).toEqual({ type: 'object' });
        expect(resolver.getUnresolvedTypes()[0].reason).toBe('generic type parameter');
    });

    describe('applyValidationConstraints', () => {
        test('maps Size, Min/Max, Email and Pattern', () => {
            expect(
                applyValidationConstraints({ type: 'string' }, [
                    annotation('Size', { min: 2, max: 140 }),
                    annotation('Email'),
                ]),
            ).toEqual({ type: 'string', minLength: 2, maxLength: 140, format: 'email' });

            expect(
                applyValidationConstraints({ type: 'integer', format: 'int32' }, [
                    annotation('Min', { value: 0 }),
                    annotation('Max', { value: 100 }),
                ]),
            ).toEqual({ type: 'integer', format: 'int32', minimum: 0, maximum: 100 });

            expect(
                applyValidationConstraints({ type: 'string' }, [
                    annotation('Pattern', { regexp: '^[a-z]+$' }),
                ]),
            ).toEqual({ type: 'string', pattern: '^[a-z]+$' });
        });

        test('Size on arrays maps to items bounds', () => {
            expect(
                applyValidationConstraints({ type: 'array', items: {} }, [
                    annotation('Size', { min: 1 }),
                ]),
            ).toEqual({ type: 'array', items: {}, minItems: 1 });
        });

        test('constraints never applied next to $ref (invalid in OAS 3.0)', () => {
            const ref = { $ref: '#/components/schemas/X' };
            expect(applyValidationConstraints(ref, [annotation('NotBlank')])).toBe(ref);
        });
    });
});
