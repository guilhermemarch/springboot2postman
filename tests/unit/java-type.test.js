const {
    parseJavaType,
    typeToString,
    substituteInText,
    splitTopLevel,
    normalizeTypeText,
} = require('../../core/parser/java-type');

describe('java-type', () => {
    describe('parseJavaType', () => {
        test('parses simple type', () => {
            expect(parseJavaType('String')).toEqual({
                name: 'String',
                qualified: 'String',
                args: [],
                arrayDims: 0,
            });
        });

        test('parses nested generics with balance', () => {
            const parsed = parseJavaType('ResponseEntity<List<User>>');
            expect(parsed.name).toBe('ResponseEntity');
            expect(parsed.args).toHaveLength(1);
            expect(parsed.args[0].name).toBe('List');
            expect(parsed.args[0].args[0].name).toBe('User');
        });

        test('parses maps with nested generic values', () => {
            const parsed = parseJavaType('Map<String, List<String>>');
            expect(parsed.name).toBe('Map');
            expect(parsed.args).toHaveLength(2);
            expect(parsed.args[0].name).toBe('String');
            expect(parsed.args[1].name).toBe('List');
            expect(parsed.args[1].args[0].name).toBe('String');
        });

        test('parses arrays and varargs', () => {
            expect(parseJavaType('byte[]').arrayDims).toBe(1);
            expect(parseJavaType('String[][]').arrayDims).toBe(2);
            expect(parseJavaType('String...').arrayDims).toBe(1);
        });

        test('parses fully qualified names keeping simple name', () => {
            const parsed = parseJavaType('java.util.List<com.example.User>');
            expect(parsed.name).toBe('List');
            expect(parsed.qualified).toBe('java.util.List');
            expect(parsed.args[0].name).toBe('User');
            expect(parsed.args[0].qualified).toBe('com.example.User');
        });

        test('handles wildcards', () => {
            expect(parseJavaType('?').name).toBe('Object');
            expect(parseJavaType('? extends Number').name).toBe('Number');
            const list = parseJavaType('List<? extends User>');
            expect(list.args[0].name).toBe('User');
        });
    });

    describe('typeToString', () => {
        test('round-trips generics', () => {
            const text = 'Map<String,List<Integer>>';
            expect(typeToString(parseJavaType(text))).toBe(text);
        });
    });

    describe('substituteInText', () => {
        test('substitutes type variables from inheritance', () => {
            const mapping = {
                T: parseJavaType('OrderResponse'),
                ID: parseJavaType('Long'),
            };
            expect(substituteInText('ResponseEntity<T>', mapping)).toBe(
                'ResponseEntity<OrderResponse>',
            );
            expect(substituteInText('ID', mapping)).toBe('Long');
            expect(substituteInText('List<T>', mapping)).toBe('List<OrderResponse>');
        });

        test('leaves unrelated types untouched', () => {
            expect(substituteInText('String', { T: parseJavaType('User') })).toBe('String');
        });
    });

    describe('splitTopLevel', () => {
        test('respects nesting depth', () => {
            expect(splitTopLevel('String, List<Map<String, Integer>>', ',')).toEqual([
                'String',
                'List<Map<String, Integer>>',
            ]);
        });

        test('respects string literals', () => {
            expect(splitTopLevel('"a,b", "c"', ',')).toEqual(['"a,b"', '"c"']);
        });
    });

    describe('normalizeTypeText', () => {
        test('collapses whitespace but keeps wildcard bounds', () => {
            expect(normalizeTypeText('Map< String , List< String > >')).toBe(
                'Map<String,List<String>>',
            );
            expect(normalizeTypeText('? extends  Foo')).toBe('? extends Foo');
        });
    });
});
