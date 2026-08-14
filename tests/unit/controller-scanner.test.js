const path = require('path');
const SourceIndex = require('../../core/parser/source-index');
const ControllerScanner = require('../../core/parser/controller-scanner');

const shopApi = path.join(__dirname, '../fixtures/shop-api');
const logger = { debug: () => {}, warn: () => {}, info: () => {} };

describe('ControllerScanner', () => {
    let index;
    const scanner = new ControllerScanner(logger);

    beforeAll(async () => {
        index = await new SourceIndex(logger).build(shopApi);
    });

    test('finds controllers across all modules (v1: multi-module found nothing)', async () => {
        const controllers = await scanner.findControllers(index);
        const names = controllers.map((f) => path.basename(f));

        expect(names).toContain('OrderController.java');
        expect(names).toContain('AdminOrderController.java');
        expect(names).toContain('ProductApiController.java');
    });

    test('@RestControllerAdvice is not a controller (v1 substring bug)', async () => {
        const controllers = await scanner.findControllers(index);
        const names = controllers.map((f) => path.basename(f));
        expect(names).not.toContain('GlobalExceptionHandler.java');
    });

    test('test sources are never scanned', async () => {
        const controllers = await scanner.findControllers(index);
        const names = controllers.map((f) => path.basename(f));
        expect(names).not.toContain('TestSupportController.java');
    });

    test('interfaces without stereotype are not standalone controllers', async () => {
        const controllers = await scanner.findControllers(index);
        const names = controllers.map((f) => path.basename(f));
        expect(names).not.toContain('ProductApi.java');
    });

    test('include/exclude filters use safe glob matching (v1: regex injection)', async () => {
        const onlyOrders = await scanner.findControllers(index, { include: '**/orders/**' });
        expect(onlyOrders.every((f) => f.includes('orders'))).toBe(true);

        const excluded = await scanner.findControllers(index, { exclude: '**/Admin*' });
        expect(excluded.some((f) => f.includes('AdminOrderController'))).toBe(false);

        // Regex metacharacters must not throw or match everything.
        await expect(
            scanner.findControllers(index, { include: '**/(((invalid/**' }),
        ).rejects.toThrow(/No Spring Boot controllers found/);
    });
});
