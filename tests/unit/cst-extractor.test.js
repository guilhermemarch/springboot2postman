const path = require('path');
const fs = require('fs');
const { parseJavaContent } = require('../../core/parser/cst-extractor');

const controllerPath = path.join(
    __dirname,
    '../fixtures/spring-app/src/main/java/com/example/api/controller/UserController.java',
);

describe('cst-extractor', () => {
    const content = fs.readFileSync(controllerPath, 'utf8');
    let parsed;

    beforeAll(async () => {
        parsed = await parseJavaContent(content);
    });

    test('extracts class annotations', () => {
        const names = parsed.classInfo.annotations.map((a) => a.name);
        expect(names).toContain('RestController');
        expect(names).toContain('RequestMapping');
    });

    test('extracts REST endpoints from controller', () => {
        expect(parsed.methods.length).toBeGreaterThanOrEqual(5);
        const getUser = parsed.methods.find((method) => method.name === 'getUser');
        expect(getUser.returnType).toBe('ResponseEntity<User>');
        expect(getUser.annotations[0].name).toBe('GetMapping');
    });

    test('extracts Pageable parameter', () => {
        const getAllUsers = parsed.methods.find((method) => method.name === 'getAllUsers');
        const pageable = getAllUsers.parameters.find((param) => param.type === 'Pageable');
        expect(pageable).toBeDefined();
    });
});
