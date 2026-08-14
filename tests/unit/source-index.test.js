const path = require('path');
const SourceIndex = require('../../core/parser/source-index');
const TypeResolver = require('../../core/parser/type-resolver');

const shopApi = path.join(__dirname, '../fixtures/shop-api');
const logger = { debug: () => {}, warn: () => {}, info: () => {} };

describe('SourceIndex', () => {
    let index;

    beforeAll(async () => {
        index = await new SourceIndex(logger).build(shopApi);
    });

    test('indexes main sources across modules, never test sources (v1 bug H5)', () => {
        const files = index.fileList.map((f) => f.split(path.sep).join('/'));
        expect(files.some((f) => f.includes('order-service/src/main'))).toBe(true);
        expect(files.some((f) => f.includes('catalog-service/src/main'))).toBe(true);
        expect(files.some((f) => f.includes('src/test'))).toBe(false);
    });

    test('resolves types through explicit imports', async () => {
        const controllerFile = index.byBasename.get('OrderController')[0];
        const model = await index.getFileModel(controllerFile);

        const resolved = await index.resolveType('OrderResponse', model);
        expect(resolved).not.toBeNull();
        expect(resolved.type.kind).toBe('class');
        expect(resolved.type.simpleName).toBe('OrderResponse');
    });

    test('resolves enums', async () => {
        const controllerFile = index.byBasename.get('OrderController')[0];
        const model = await index.getFileModel(controllerFile);

        const resolved = await index.resolveType('OrderStatus', model);
        expect(resolved.type.kind).toBe('enum');
        expect(resolved.type.enumConstants).toContain('PENDING');
    });

    test('resolves same-package types without imports', async () => {
        const dtoFile = index.byBasename.get('OrderResponse')[0];
        const model = await index.getFileModel(dtoFile);

        const resolved = await index.resolveType('CustomerSummary', model);
        expect(resolved).not.toBeNull();
        expect(resolved.type.simpleName).toBe('CustomerSummary');
    });

    test('collects inherited fields, parents first (v1: extends was ignored)', async () => {
        const itemFile = index.byBasename.get('OrderItem')[0];
        const model = await index.getFileModel(itemFile);
        const entry = await index.resolveType('OrderItem', model);

        const fields = await index.collectFields(entry);
        expect(fields.map((f) => f.name)).toEqual([
            'productId',
            'productName',
            'quantity',
            'unitPrice',
        ]);
    });

    test('records parse failures instead of crashing', async () => {
        const result = await index.getFileModel(path.join(shopApi, 'does-not-exist.java'));
        expect(result).toBeNull();
        expect(index.getFailedFiles().length).toBeGreaterThanOrEqual(1);
    });
});

describe('TypeResolver with SourceIndex (project types)', () => {
    let index;
    let resolver;
    let controllerModel;

    beforeAll(async () => {
        index = await new SourceIndex(logger).build(shopApi);
        resolver = new TypeResolver(index, logger);
        const controllerFile = index.byBasename.get('OrderController')[0];
        controllerModel = await index.getFileModel(controllerFile);
    });

    test('builds object schema with Jackson and validation applied', async () => {
        const schema = await resolver.resolveTypeText('OrderResponse', controllerModel);
        expect(schema.$ref).toBe('#/components/schemas/OrderResponse');

        const registered = resolver.getSchemas().OrderResponse;
        // @JsonProperty rename
        expect(registered.properties.order_number).toBeDefined();
        expect(registered.properties.orderNumber).toBeUndefined();
        // @JsonIgnore removal
        expect(registered.properties.internalNotes).toBeUndefined();
        // enum field resolves to a $ref'd enum schema
        expect(registered.properties.status.$ref).toBe('#/components/schemas/OrderStatus');
        expect(resolver.getSchemas().OrderStatus.enum).toEqual([
            'PENDING',
            'PAID',
            'SHIPPED',
            'DELIVERED',
            'CANCELLED',
        ]);
        // nested generics survive (v1 dropped them)
        expect(registered.properties.metadata).toEqual({
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
        });
        // nested DTO keeps structure through $ref (v1 emitted bare object)
        expect(registered.properties.customer.$ref).toBe(
            '#/components/schemas/CustomerSummary',
        );
        expect(registered.properties.items.items.$ref).toBe('#/components/schemas/OrderItem');
    });

    test('record schemas carry validation constraints', async () => {
        await resolver.resolveTypeText('CreateOrderRequest', controllerModel);
        const schema = resolver.getSchemas().CreateOrderRequest;

        expect(schema.required).toEqual(
            expect.arrayContaining(['customerId', 'note', 'items']),
        );
        expect(schema.properties.note.maxLength).toBe(140);
        expect(schema.properties.items.minItems).toBe(1);
        expect(schema.properties.discountPercent).toMatchObject({ minimum: 0, maximum: 100 });
        // primitive int is required by nature
        const itemSchema = resolver.getSchemas().OrderItemRequest;
        expect(itemSchema.required).toContain('quantity');
    });

    test('inherited DTO fields appear in the schema', async () => {
        await resolver.resolveTypeText('OrderItem', controllerModel);
        const schema = resolver.getSchemas().OrderItem;
        expect(schema.properties.productId).toBeDefined();
        expect(schema.properties.productName).toBeDefined();
        expect(schema.properties.quantity).toBeDefined();
    });
});
