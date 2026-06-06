const DtoScanner = require('../../core/parser/dto-scanner');
const Logger = require('../../lib/logger');

describe('DtoScanner', () => {
    const scanner = new DtoScanner(new Logger(false));

    beforeEach(() => {
        scanner.dtoCache.clear();
        scanner.dtoCache.set('UserDTO', {
            name: 'UserDTO',
            fields: [{ name: 'email', type: 'String' }],
        });
        scanner.dtoCache.set('UserAuditDTO', {
            name: 'UserAuditDTO',
            fields: [{ name: 'action', type: 'String' }],
        });
    });

    test('getDto returns exact match', () => {
        expect(scanner.getDto('UserDTO').name).toBe('UserDTO');
    });

    test('getDto does not return longer prefix match for User', () => {
        expect(scanner.getDto('User').name).toBe('UserDTO');
        expect(scanner.getDto('User').name).not.toBe('UserAuditDTO');
    });
});
