const AnnotationExtractor = require('../../core/parser/annotation-extractor');
const Logger = require('../../lib/logger');

describe('AnnotationExtractor', () => {
    const extractor = new AnnotationExtractor(new Logger(false));

    test('extracts GET mapping path and method', () => {
        const infos = extractor.extractEndpointInfos([
            { name: 'GetMapping', value: '"/users"', raw: '@GetMapping("/users")' },
        ]);

        expect(infos).toEqual([
            {
                method: 'GET',
                path: '/users',
                annotation: 'GetMapping',
            },
        ]);
    });

    test('extracts RequestMapping HTTP method', () => {
        const infos = extractor.extractEndpointInfos([
            {
                name: 'RequestMapping',
                value: 'method = RequestMethod.POST, value = "/items"',
                raw: '@RequestMapping(method = RequestMethod.POST, value = "/items")',
            },
        ]);

        expect(infos).toHaveLength(1);
        expect(infos[0].method).toBe('POST');
        expect(infos[0].path).toBe('/items');
    });

    test('expands RequestMapping without method to all HTTP verbs', () => {
        const infos = extractor.extractEndpointInfos([
            {
                name: 'RequestMapping',
                value: '"/legacy"',
                raw: '@RequestMapping("/legacy")',
            },
        ]);

        expect(infos.map((info) => info.method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
        expect(infos.every((info) => info.path === '/legacy')).toBe(true);
    });

    test('creates Pageable query parameters', () => {
        const params = extractor.extractParameterInfos([], 'pageable', 'Pageable');

        expect(params).toHaveLength(3);
        expect(params.map((p) => p.name)).toEqual(['page', 'size', 'sort']);
    });

    test('extracts RequestParam default value', () => {
        const params = extractor.extractParameterInfos(
            [
                {
                    name: 'RequestParam',
                    value: 'defaultValue = "10"',
                    raw: '@RequestParam(defaultValue = "10")',
                },
            ],
            'limit',
            'Integer',
        );

        expect(params[0].defaultValue).toBe('10');
    });
});
