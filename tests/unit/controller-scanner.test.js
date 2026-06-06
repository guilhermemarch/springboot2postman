const path = require('path');
const ControllerScanner = require('../../core/parser/controller-scanner');
const Logger = require('../../lib/logger');

const fixtureRoot = path.join(__dirname, '../fixtures/spring-app');

describe('ControllerScanner', () => {
    const scanner = new ControllerScanner(new Logger(false));

    test('finds controllers even when BaseController exists', async () => {
        const controllers = await scanner.findControllers(fixtureRoot);

        const names = controllers.map((file) => path.basename(file));
        expect(names).toContain('UserController.java');
        expect(names).toContain('UserResource.java');
        expect(names).not.toContain('BaseController.java');
    });
});
