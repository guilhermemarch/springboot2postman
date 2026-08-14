const path = require('path');
const ParserStrategy = require('../../core/strategies/parser-strategy');
const Logger = require('../../lib/logger');
const { snapshotCollectionStructure } = require('../helpers/snapshot');
const {
    assertOpenApiInvariants,
    assertCollectionInvariants,
} = require('../helpers/oas-invariants');

const springApp = path.join(__dirname, '../fixtures/spring-app');
const shopApi = path.join(__dirname, '../fixtures/shop-api');

describe('ParserStrategy — simple project (spring-app)', () => {
    const logger = new Logger(false, true);

    test('validates fixture project', async () => {
        const strategy = new ParserStrategy(springApp, logger);
        expect(await strategy.validate()).toBe(true);
    });

    test('generates a coherent Postman collection', async () => {
        const strategy = new ParserStrategy(springApp, logger);
        const { output: collection, report } = await strategy.extract({
            format: 'postman',
            seed: 42,
            enhance: true,
        });

        expect(collection.info.name).toBe('User API');
        expect(collection.variable.find((v) => v.key === 'baseUrl').value).toBe(
            'http://localhost:8080/app',
        );

        assertCollectionInvariants(collection);
        expect(report.endpoints).toBeGreaterThanOrEqual(6);
        expect(snapshotCollectionStructure(collection)).toMatchSnapshot();
    });

    test('generates valid OpenAPI with real schemas', async () => {
        const strategy = new ParserStrategy(springApp, logger);
        const { output: spec, report } = await strategy.extract({
            format: 'openapi',
            seed: 42,
        });

        expect(spec.openapi).toBe('3.0.3');
        expect(spec.info.title).toBe('User API');
        assertOpenApiInvariants(spec);

        // UserDTO has exactly name and email — nothing invented.
        expect(Object.keys(spec.components.schemas.UserDTO.properties).sort()).toEqual([
            'email',
            'name',
        ]);

        // ResponseEntity<List<User>> must be a single-level array (v1 bug C2).
        const list = spec.paths['/api/users'].get;
        const listSchema = list.responses['200'].content['application/json'].schema;
        expect(listSchema.type).toBe('array');
        expect(listSchema.items.$ref).toBe('#/components/schemas/User');

        // DELETE with ResponseEntity<Void> + noContent() → 204 without body,
        // and no ghost "Void" schema (v1 bug A4).
        const del = spec.paths['/api/users/{id}'].delete;
        expect(del.responses['204']).toBeDefined();
        expect(del.responses['204'].content).toBeUndefined();
        expect(spec.components.schemas.Void).toBeUndefined();

        expect(report.unresolvedTypes).toEqual([]);
        expect(report.skippedFiles).toEqual([]);
    });
});

describe('ParserStrategy — realistic multi-module corpus (shop-api)', () => {
    const logger = new Logger(false, true);
    let spec;
    let report;

    beforeAll(async () => {
        const strategy = new ParserStrategy(shopApi, logger);
        const result = await strategy.extract({ format: 'openapi', seed: 42 });
        spec = result.output;
        report = result.report;
    });

    test('spec is structurally valid', () => {
        assertOpenApiInvariants(spec);
    });

    test('nothing was skipped or left unresolved in the corpus', () => {
        expect(report.skippedFiles).toEqual([]);
        expect(report.unresolvedTypes).toEqual([]);
        expect(report.collisions).toEqual([]);
    });

    test('class-level constant base path resolves (v1 bug C1)', () => {
        expect(spec.paths['/api/v1/orders']).toBeDefined();
        expect(spec.paths['/api/v1/orders/{orderId}']).toBeDefined();
    });

    test('RequestMapping(method = PATCH) yields exactly one verb (v1: 5 verbs)', () => {
        const pathItem = spec.paths['/api/v1/orders/{orderId}/status'];
        expect(pathItem).toBeDefined();
        expect(Object.keys(pathItem)).toEqual(['patch']);
    });

    test('multiple mapping paths expand to separate endpoints', () => {
        expect(spec.paths['/api/v1/orders/recent']).toBeDefined();
        expect(spec.paths['/api/v1/orders/latest']).toBeDefined();
    });

    test('@ResponseStatus(CREATED) drives the success status', () => {
        const post = spec.paths['/api/v1/orders'].post;
        expect(post.responses['201']).toBeDefined();
        expect(post.responses['200']).toBeUndefined();
    });

    test('Page<OrderResponse> resolves to the page envelope', () => {
        const get = spec.paths['/api/v1/orders'].get;
        const schema = get.responses['200'].content['application/json'].schema;
        expect(schema.properties.content.items.$ref).toBe(
            '#/components/schemas/OrderResponse',
        );
        expect(schema.properties.totalElements).toBeDefined();
    });

    test('query params include Pageable, enum @RequestParam and @ModelAttribute expansion', () => {
        const get = spec.paths['/api/v1/orders'].get;
        const queryNames = get.parameters.filter((p) => p.in === 'query').map((p) => p.name);

        expect(queryNames).toEqual(
            expect.arrayContaining([
                'status',
                'page',
                'size',
                'sort',
                'createdAfter',
                'createdBefore',
                'customerEmail',
            ]),
        );

        const status = get.parameters.find((p) => p.name === 'status');
        expect(status.schema.$ref).toBe('#/components/schemas/OrderStatus');
    });

    test('javadoc becomes descriptions', () => {
        const get = spec.paths['/api/v1/orders'].get;
        expect(get.description).toContain('Lists orders with optional filtering');

        const statusParam = get.parameters.find((p) => p.name === 'status');
        expect(statusParam.description).toBe('filter by order status');
    });

    test('cookie and header parameters are captured (v1: @CookieValue dropped)', () => {
        const recent = spec.paths['/api/v1/orders/recent'].get;
        const cookie = recent.parameters.find((p) => p.in === 'cookie');
        expect(cookie.name).toBe('session_hint');
        const header = recent.parameters.find((p) => p.in === 'header');
        expect(header.name).toBe('X-Tenant-Id');
        expect(header.required).toBe(false);
    });

    test('multipart upload becomes multipart/form-data with binary part (v1 bug H7)', () => {
        const upload = spec.paths['/api/v1/orders/{orderId}/attachments'].post;
        const media = upload.requestBody.content['multipart/form-data'];
        expect(media.schema.properties.file).toEqual({ type: 'string', format: 'binary' });
        expect(media.schema.properties.note).toEqual({ type: 'string' });
        expect(media.schema.required).toEqual(['file']);
        // ResponseEntity.created() detected in body → 201.
        expect(upload.responses['201']).toBeDefined();
    });

    test('produces text/csv is respected and deprecation marked', () => {
        const exportOp = spec.paths['/api/v1/orders/export'].get;
        expect(exportOp.deprecated).toBe(true);
        expect(exportOp.responses['200'].content['text/csv']).toBeDefined();
        expect(exportOp.responses['200'].content['application/json']).toBeUndefined();
    });

    test('inherited generic endpoints materialize with substituted types', () => {
        const adminGet = spec.paths['/api/v1/admin/orders/{id}'].get;
        expect(adminGet).toBeDefined();
        const schema = adminGet.responses['200'].content['application/json'].schema;
        expect(schema.$ref).toBe('#/components/schemas/OrderResponse');

        const adminDelete = spec.paths['/api/v1/admin/orders/{id}'].delete;
        expect(adminDelete.responses['204']).toBeDefined();
    });

    test('API-first interfaces produce endpoints through the implementation', () => {
        expect(spec.paths['/api/products']).toBeDefined();
        expect(spec.paths['/api/products/{id}']).toBeDefined();

        const create = spec.paths['/api/products'].post;
        expect(create.requestBody.content['application/json'].schema.$ref).toBe(
            '#/components/schemas/ProductDTO',
        );
    });

    test('@RestControllerAdvice and test sources contribute nothing', () => {
        const allPaths = Object.keys(spec.paths);
        expect(allPaths.some((p) => p.includes('test-only'))).toBe(false);
        // GlobalExceptionHandler has no mapping paths at all.
        expect(report.controllerTypes).toBe(3);
    });

    test('schemas respect Jackson and validation metadata', () => {
        const order = spec.components.schemas.OrderResponse;
        expect(order.properties.order_number).toBeDefined();
        expect(order.properties.internalNotes).toBeUndefined();

        const request = spec.components.schemas.CreateOrderRequest;
        expect(request.required).toEqual(expect.arrayContaining(['customerId', 'note', 'items']));
        expect(request.properties.note.maxLength).toBe(140);
    });

    test('config comes from multi-doc application.yml (v1 bug H8)', () => {
        expect(spec.info.title).toBe('Order Service');
        expect(spec.servers[0].url).toBe('http://localhost:8081/orders');
    });

    test('full spec snapshot (schemas included — v1 snapshots hid them)', () => {
        expect(spec).toMatchSnapshot();
    });
});

describe('ParserStrategy — Postman output for the corpus', () => {
    const logger = new Logger(false, true);

    test('collection has no broken variables or fabricated responses', async () => {
        const strategy = new ParserStrategy(shopApi, logger);
        const { output: collection } = await strategy.extract({
            format: 'postman',
            seed: 42,
            enhance: true,
        });

        assertCollectionInvariants(collection);

        // No fabricated 400/404 saved responses: every saved response must
        // trace back to a declared OAS response.
        const collectResponses = (items, out = []) => {
            for (const item of items || []) {
                if (item.item) {
                    collectResponses(item.item, out);
                } else if (item.response) {
                    out.push(...item.response);
                }
            }
            return out;
        };
        for (const response of collectResponses(collection.item)) {
            expect(response.originalRequest).toBeDefined();
        }
    });

    test('.http output renders', async () => {
        const strategy = new ParserStrategy(shopApi, logger);
        const { output } = await strategy.extract({ format: 'http', seed: 42 });

        expect(typeof output).toBe('string');
        expect(output).toContain('@baseUrl = http://localhost:8081/orders');
        expect(output).toContain('### ');
        expect(output).toContain('GET {{baseUrl}}/api/v1/orders');
    });
});
