const AnnotationExtractor = require('../../core/parser/annotation-extractor');
const { detectStatusesFromBody } = require('../../core/parser/annotation-extractor');

const extractor = new AnnotationExtractor(console);

function annotation(name, attributes = {}) {
    return { name, attributes, raw: `@${name}(...)` };
}

describe('AnnotationExtractor', () => {
    describe('extractClassMapping', () => {
        test('reads value attribute (named form)', () => {
            const mapping = extractor.extractClassMapping([
                annotation('RequestMapping', {
                    value: '/api/v1/users',
                    produces: 'application/json',
                }),
            ]);
            expect(mapping.paths).toEqual(['/api/v1/users']);
            expect(mapping.produces).toEqual(['application/json']);
        });

        test('supports multiple class-level paths', () => {
            const mapping = extractor.extractClassMapping([
                annotation('RequestMapping', { value: ['/api/v1', '/api/v2'] }),
            ]);
            expect(mapping.paths).toEqual(['/api/v1', '/api/v2']);
        });

        test('defaults to empty path without mapping', () => {
            expect(extractor.extractClassMapping([]).paths).toEqual(['']);
        });
    });

    describe('extractEndpointInfos', () => {
        test('RequestMapping with explicit method produces exactly one verb (v1 bug C1)', () => {
            const infos = extractor.extractEndpointInfos([
                annotation('RequestMapping', {
                    value: '/x',
                    method: { ref: 'RequestMethod.POST' },
                }),
            ]);
            expect(infos).toHaveLength(1);
            expect(infos[0]).toMatchObject({ method: 'POST', path: '/x' });
        });

        test('RequestMapping without method expands to the five main verbs', () => {
            const infos = extractor.extractEndpointInfos([
                annotation('RequestMapping', { value: '/x' }),
            ]);
            expect(infos.map((i) => i.method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
        });

        test('multiple paths expand to multiple endpoints', () => {
            const infos = extractor.extractEndpointInfos([
                annotation('GetMapping', { value: ['/recent', '/latest'] }),
            ]);
            expect(infos.map((i) => i.path)).toEqual(['/recent', '/latest']);
        });

        test('produces attribute does not leak into the path (v1 latent bug)', () => {
            const infos = extractor.extractEndpointInfos([
                annotation('GetMapping', { produces: 'text/csv' }),
            ]);
            expect(infos[0].path).toBe('');
            expect(infos[0].produces).toEqual(['text/csv']);
        });

        test('method attribute accepts arrays', () => {
            const infos = extractor.extractEndpointInfos([
                annotation('RequestMapping', {
                    value: '/x',
                    method: [{ ref: 'RequestMethod.GET' }, { ref: 'RequestMethod.HEAD' }],
                }),
            ]);
            expect(infos.map((i) => i.method)).toEqual(['GET', 'HEAD']);
        });
    });

    describe('extractResponseStatus', () => {
        test('maps HttpStatus refs to numbers', () => {
            const status = extractor.extractResponseStatus([
                annotation('ResponseStatus', { value: { ref: 'HttpStatus.CREATED' } }),
            ]);
            expect(status).toBe(201);
        });

        test('supports the code attribute', () => {
            const status = extractor.extractResponseStatus([
                annotation('ResponseStatus', { code: { ref: 'HttpStatus.ACCEPTED' } }),
            ]);
            expect(status).toBe(202);
        });

        test('returns null when absent', () => {
            expect(extractor.extractResponseStatus([])).toBeNull();
        });
    });

    describe('extractParameterInfos', () => {
        test('@PathVariable with custom name', () => {
            const infos = extractor.extractParameterInfos({
                name: 'orderId',
                type: 'UUID',
                annotations: [annotation('PathVariable', { value: 'id' })],
            });
            expect(infos[0]).toMatchObject({ in: 'path', name: 'id', required: true });
        });

        test('@RequestParam with defaultValue is optional (Spring semantics)', () => {
            const infos = extractor.extractParameterInfos({
                name: 'limit',
                type: 'Integer',
                annotations: [annotation('RequestParam', { defaultValue: '10' })],
            });
            expect(infos[0]).toMatchObject({
                in: 'query',
                required: false,
                defaultValue: '10',
            });
        });

        test('@CookieValue maps to cookie parameter', () => {
            const infos = extractor.extractParameterInfos({
                name: 'sessionHint',
                type: 'String',
                annotations: [
                    annotation('CookieValue', { value: 'session_hint', required: false }),
                ],
            });
            expect(infos[0]).toMatchObject({
                in: 'cookie',
                name: 'session_hint',
                required: false,
            });
        });

        test('@RequestPart maps to multipart part (v1 bug H7: was silently dropped)', () => {
            const infos = extractor.extractParameterInfos({
                name: 'file',
                type: 'MultipartFile',
                annotations: [annotation('RequestPart', { value: 'file' })],
            });
            expect(infos[0]).toMatchObject({ in: 'part', name: 'file', required: true });
        });

        test('unannotated MultipartFile maps to multipart part', () => {
            const infos = extractor.extractParameterInfos({
                name: 'file',
                type: 'MultipartFile',
                annotations: [],
            });
            expect(infos[0]).toMatchObject({ in: 'part', name: 'file' });
        });

        test('framework parameters are skipped', () => {
            for (const type of ['HttpServletRequest', 'Principal', 'BindingResult', 'Model']) {
                expect(
                    extractor.extractParameterInfos({ name: 'x', type, annotations: [] }),
                ).toEqual([]);
            }
        });

        test('unannotated simple types become optional query params', () => {
            const infos = extractor.extractParameterInfos({
                name: 'query',
                type: 'String',
                annotations: [],
            });
            expect(infos[0]).toMatchObject({ in: 'query', name: 'query', required: false });
        });

        test('unannotated POJOs become modelAttribute for expansion', () => {
            const infos = extractor.extractParameterInfos({
                name: 'filter',
                type: 'OrderFilter',
                annotations: [],
            });
            expect(infos[0].in).toBe('modelAttribute');
        });

        test('Pageable expands to page/size/sort', () => {
            const infos = extractor.extractParameterInfos({
                name: 'pageable',
                type: 'Pageable',
                annotations: [],
            });
            expect(infos.map((i) => i.name)).toEqual(['page', 'size', 'sort']);
        });

        test('@AuthenticationPrincipal parameters are not part of the contract', () => {
            const infos = extractor.extractParameterInfos({
                name: 'user',
                type: 'UserDetails',
                annotations: [annotation('AuthenticationPrincipal')],
            });
            expect(infos).toEqual([]);
        });
    });

    describe('detectStatusesFromBody', () => {
        test('detects ResponseEntity factory statuses', () => {
            const body = `{
                if (missing) { return ResponseEntity.notFound().build(); }
                return ResponseEntity.created(uri).body(result);
            }`;
            expect(detectStatusesFromBody(body)).toEqual({
                success: [201],
                errors: [404],
            });
        });

        test('detects status(HttpStatus.X) calls', () => {
            const body = `{ return ResponseEntity.status(HttpStatus.ACCEPTED).build(); }`;
            expect(detectStatusesFromBody(body).success).toEqual([202]);
        });

        test('empty body yields nothing', () => {
            expect(detectStatusesFromBody('')).toEqual({ success: [], errors: [] });
        });
    });
});
