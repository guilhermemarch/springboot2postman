/**
 * Maps structured Spring annotations (produced by cst-extractor) to endpoint
 * and parameter descriptors. Pure and synchronous: cross-file constant
 * resolution happens in the strategy before values reach this module.
 */

const MAPPING_ANNOTATIONS = {
    GetMapping: ['GET'],
    PostMapping: ['POST'],
    PutMapping: ['PUT'],
    DeleteMapping: ['DELETE'],
    PatchMapping: ['PATCH'],
};

const REQUEST_MAPPING_DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const HTTP_STATUS_CODES = {
    CONTINUE: 100,
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NON_AUTHORITATIVE_INFORMATION: 203,
    NO_CONTENT: 204,
    RESET_CONTENT: 205,
    PARTIAL_CONTENT: 206,
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    SEE_OTHER: 303,
    NOT_MODIFIED: 304,
    TEMPORARY_REDIRECT: 307,
    PERMANENT_REDIRECT: 308,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    PAYMENT_REQUIRED: 402,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    NOT_ACCEPTABLE: 406,
    REQUEST_TIMEOUT: 408,
    CONFLICT: 409,
    GONE: 410,
    PRECONDITION_FAILED: 412,
    PAYLOAD_TOO_LARGE: 413,
    UNSUPPORTED_MEDIA_TYPE: 415,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
};

/**
 * Handler method parameters of these types are provided by the framework and
 * are not part of the HTTP contract.
 */
const FRAMEWORK_PARAM_TYPES = new Set([
    'HttpServletRequest',
    'HttpServletResponse',
    'ServletRequest',
    'ServletResponse',
    'HttpSession',
    'WebRequest',
    'NativeWebRequest',
    'ServletWebRequest',
    'Principal',
    'Authentication',
    'SecurityContext',
    'SecurityContextHolder',
    'Model',
    'ModelMap',
    'ModelAndView',
    'BindingResult',
    'Errors',
    'SessionStatus',
    'RedirectAttributes',
    'UriComponentsBuilder',
    'ServletUriComponentsBuilder',
    'Locale',
    'TimeZone',
    'ZoneId',
    'Reader',
    'Writer',
    'InputStream',
    'OutputStream',
    'HttpMethod',
    'HttpHeaders',
    'ServerWebExchange',
    'ServerHttpRequest',
    'ServerHttpResponse',
    'WebSession',
    'CsrfToken',
    'SseEmitter',
]);

const SKIP_PARAM_ANNOTATIONS = new Set([
    'AuthenticationPrincipal',
    'RequestAttribute',
    'SessionAttribute',
    'ApiIgnore',
    'Parameter',
    'Hidden',
]);

/**
 * Types Spring binds as a single query parameter when unannotated.
 */
const SIMPLE_VALUE_TYPES = new Set([
    'String',
    'CharSequence',
    'char',
    'Character',
    'int',
    'Integer',
    'short',
    'Short',
    'long',
    'Long',
    'byte',
    'Byte',
    'float',
    'Float',
    'double',
    'Double',
    'Number',
    'BigDecimal',
    'BigInteger',
    'boolean',
    'Boolean',
    'Date',
    'LocalDate',
    'LocalDateTime',
    'ZonedDateTime',
    'OffsetDateTime',
    'Instant',
    'LocalTime',
    'Duration',
    'Period',
    'Year',
    'YearMonth',
    'UUID',
    'URI',
    'URL',
    'Locale',
    'Currency',
]);

function asArray(value) {
    if (value === null || value === undefined) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function stringValues(value) {
    return asArray(value).filter((v) => typeof v === 'string');
}

function refValues(value) {
    return asArray(value)
        .filter((v) => v && typeof v === 'object' && typeof v.ref === 'string')
        .map((v) => v.ref);
}

class AnnotationExtractor {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Class-level @RequestMapping: returns
     * { paths: [...], produces: [...], consumes: [...], unresolvedPaths: [...] }.
     * `paths` contains [''] when there is no mapping.
     */
    extractClassMapping(classAnnotations) {
        const mapping = { paths: [''], produces: [], consumes: [], unresolvedPaths: [] };

        const annotation = (classAnnotations || []).find((a) => a.name === 'RequestMapping');
        if (!annotation) {
            return mapping;
        }

        const pathValue = annotation.attributes.value ?? annotation.attributes.path;
        const paths = stringValues(pathValue);
        mapping.unresolvedPaths = refValues(pathValue);
        if (paths.length > 0) {
            mapping.paths = paths;
        }

        mapping.produces = stringValues(annotation.attributes.produces);
        mapping.consumes = stringValues(annotation.attributes.consumes);

        return mapping;
    }

    /**
     * Method-level mapping annotations expanded into endpoint descriptors:
     * one per (HTTP method x path). Returns [] when the method is not a
     * handler.
     */
    extractEndpointInfos(methodAnnotations) {
        const infos = [];

        for (const annotation of methodAnnotations || []) {
            const isShortcut = Object.prototype.hasOwnProperty.call(
                MAPPING_ANNOTATIONS,
                annotation.name,
            );
            const isRequestMapping = annotation.name === 'RequestMapping';
            if (!isShortcut && !isRequestMapping) {
                continue;
            }

            const pathValue = annotation.attributes.value ?? annotation.attributes.path;
            let paths = stringValues(pathValue);
            const unresolvedPaths = refValues(pathValue);
            if (paths.length === 0) {
                paths = [''];
            }

            const httpMethods = isShortcut
                ? MAPPING_ANNOTATIONS[annotation.name]
                : this.extractRequestMappingMethods(annotation);

            const produces = stringValues(annotation.attributes.produces);
            const consumes = stringValues(annotation.attributes.consumes);

            const explicitMethod =
                isShortcut || httpMethods.length < REQUEST_MAPPING_DEFAULT_METHODS.length;

            for (const httpMethod of httpMethods) {
                for (const path of paths) {
                    infos.push({
                        method: httpMethod,
                        path,
                        produces,
                        consumes,
                        annotation: annotation.name,
                        unresolvedPaths,
                        explicitMethod,
                    });
                }
            }

            // Only the first mapping annotation applies (Spring ignores others).
            break;
        }

        return infos;
    }

    extractRequestMappingMethods(annotation) {
        const methods = [];
        for (const ref of refValues(annotation.attributes.method)) {
            const name = ref.split('.').pop().toUpperCase();
            if (name && !methods.includes(name)) {
                methods.push(name);
            }
        }
        return methods.length > 0 ? methods : [...REQUEST_MAPPING_DEFAULT_METHODS];
    }

    /**
     * @ResponseStatus on the method or class: returns a numeric status or null.
     */
    extractResponseStatus(annotations) {
        const annotation = (annotations || []).find((a) => a.name === 'ResponseStatus');
        if (!annotation) {
            return null;
        }
        const value = annotation.attributes.value ?? annotation.attributes.code;
        for (const ref of refValues(value)) {
            const name = ref.split('.').pop();
            if (HTTP_STATUS_CODES[name] !== undefined) {
                return HTTP_STATUS_CODES[name];
            }
        }
        const numeric = asArray(value).find((v) => typeof v === 'number');
        return numeric ?? null;
    }

    isDeprecated(annotations) {
        return (annotations || []).some((a) => a.name === 'Deprecated');
    }

    /**
     * Map one handler parameter to descriptors. Returns [] for framework
     * parameters. Descriptor kinds (`in`):
     *   path | query | header | cookie | body | part | modelAttribute
     */
    extractParameterInfos(param) {
        const { name, type, annotations } = param;
        const baseType = type.split('<')[0].replace(/\[\]/g, '');

        for (const annotation of annotations || []) {
            if (SKIP_PARAM_ANNOTATIONS.has(annotation.name)) {
                return [];
            }

            const info = this.mapAnnotatedParameter(annotation, name, type);
            if (info) {
                return info;
            }
        }

        // Unannotated parameters.
        if (this.isPageableType(baseType)) {
            return this.createPageableParameters();
        }
        if (baseType === 'Sort') {
            return [
                {
                    in: 'query',
                    name: 'sort',
                    required: false,
                    type: 'String',
                    description: 'Sorting criteria: property(,asc|desc)',
                },
            ];
        }
        if (FRAMEWORK_PARAM_TYPES.has(baseType)) {
            return [];
        }
        if (baseType === 'MultipartFile') {
            return [{ in: 'part', name, required: true, type }];
        }
        if (baseType === 'HttpEntity' || baseType === 'RequestEntity') {
            const inner = type.includes('<') ? type.slice(type.indexOf('<') + 1, -1) : 'Object';
            return [{ in: 'body', name, required: true, type: inner }];
        }
        if (this.isSimpleValueType(type)) {
            // Spring binds simple types as optional query parameters.
            return [{ in: 'query', name, required: false, type }];
        }

        // Complex unannotated POJO: implicit @ModelAttribute.
        return [{ in: 'modelAttribute', name, required: false, type }];
    }

    mapAnnotatedParameter(annotation, paramName, paramType) {
        const attrs = annotation.attributes || {};

        switch (annotation.name) {
            case 'PathVariable':
                return [
                    {
                        in: 'path',
                        name: this.parameterName(attrs, paramName),
                        required: attrs.required !== false,
                        type: paramType,
                    },
                ];

            case 'RequestParam': {
                const requestParamBase = paramType.split('<')[0];
                if (
                    requestParamBase === 'MultipartFile' ||
                    paramType.startsWith('List<MultipartFile')
                ) {
                    return [
                        {
                            in: 'part',
                            name: this.parameterName(attrs, paramName),
                            required: attrs.required !== false,
                            type: paramType,
                        },
                    ];
                }
                const defaultValue =
                    typeof attrs.defaultValue === 'string' || typeof attrs.defaultValue === 'number'
                        ? attrs.defaultValue
                        : undefined;
                return [
                    {
                        in: 'query',
                        name: this.parameterName(attrs, paramName),
                        required: attrs.required !== false && defaultValue === undefined,
                        type: paramType,
                        defaultValue,
                    },
                ];
            }

            case 'RequestHeader':
                return [
                    {
                        in: 'header',
                        name: this.parameterName(attrs, paramName),
                        required: attrs.required !== false && attrs.defaultValue === undefined,
                        type: paramType,
                        defaultValue:
                            typeof attrs.defaultValue === 'string' ? attrs.defaultValue : undefined,
                    },
                ];

            case 'CookieValue':
                return [
                    {
                        in: 'cookie',
                        name: this.parameterName(attrs, paramName),
                        required: attrs.required !== false && attrs.defaultValue === undefined,
                        type: paramType,
                    },
                ];

            case 'RequestBody':
                return [
                    {
                        in: 'body',
                        name: paramName,
                        required: attrs.required !== false,
                        type: paramType,
                    },
                ];

            case 'RequestPart':
                return [
                    {
                        in: 'part',
                        name: this.parameterName(attrs, paramName),
                        required: attrs.required !== false,
                        type: paramType,
                    },
                ];

            case 'ModelAttribute':
                return [
                    {
                        in: 'modelAttribute',
                        name: this.parameterName(attrs, paramName),
                        required: false,
                        type: paramType,
                    },
                ];

            case 'MatrixVariable':
                // Rarely used; expose as a query-style parameter for usability.
                return [
                    {
                        in: 'query',
                        name: this.parameterName(attrs, paramName),
                        required: attrs.required !== false,
                        type: paramType,
                    },
                ];

            default:
                return null;
        }
    }

    parameterName(attrs, fallback) {
        if (typeof attrs.value === 'string' && attrs.value) {
            return attrs.value;
        }
        if (typeof attrs.name === 'string' && attrs.name) {
            return attrs.name;
        }
        return fallback;
    }

    isPageableType(baseType) {
        return baseType === 'Pageable' || baseType === 'PageRequest';
    }

    isSimpleValueType(typeText) {
        const base = typeText.split('<')[0].replace(/\[\]/g, '');
        if (SIMPLE_VALUE_TYPES.has(base)) {
            return true;
        }
        // Collections and arrays of simple values bind as repeated params.
        const genericMatch = typeText.match(/^(List|Set|Collection)<(.+)>$/);
        if (genericMatch) {
            return this.isSimpleValueType(genericMatch[2]);
        }
        if (typeText.endsWith('[]')) {
            return this.isSimpleValueType(typeText.slice(0, -2));
        }
        return false;
    }

    createPageableParameters() {
        return [
            {
                in: 'query',
                name: 'page',
                required: false,
                type: 'Integer',
                defaultValue: 0,
                description: 'Zero-based page index',
            },
            {
                in: 'query',
                name: 'size',
                required: false,
                type: 'Integer',
                defaultValue: 20,
                description: 'Page size',
            },
            {
                in: 'query',
                name: 'sort',
                required: false,
                type: 'String',
                description: 'Sorting criteria: property(,asc|desc)',
            },
        ];
    }
}

/**
 * Detect HTTP statuses the method body actually produces via ResponseEntity
 * factory methods and status(...) calls. Source-derived, never guessed.
 */
function detectStatusesFromBody(bodyText) {
    if (!bodyText) {
        return { success: [], errors: [] };
    }

    const statuses = new Set();

    const factories = {
        'ResponseEntity.ok': 200,
        'ResponseEntity.created': 201,
        'ResponseEntity.accepted': 202,
        'ResponseEntity.noContent': 204,
        'ResponseEntity.badRequest': 400,
        'ResponseEntity.notFound': 404,
        'ResponseEntity.unprocessableEntity': 422,
        'ResponseEntity.internalServerError': 500,
    };

    for (const [factory, status] of Object.entries(factories)) {
        if (bodyText.includes(`${factory}(`)) {
            statuses.add(status);
        }
    }

    const statusCalls = bodyText.matchAll(/\.status\(\s*HttpStatus\.(\w+)\s*\)/g);
    for (const match of statusCalls) {
        if (HTTP_STATUS_CODES[match[1]] !== undefined) {
            statuses.add(HTTP_STATUS_CODES[match[1]]);
        }
    }

    const numericStatusCalls = bodyText.matchAll(/\.status\(\s*(\d{3})\s*\)/g);
    for (const match of numericStatusCalls) {
        statuses.add(parseInt(match[1], 10));
    }

    const all = [...statuses];
    return {
        success: all.filter((s) => s < 400).sort((a, b) => a - b),
        errors: all.filter((s) => s >= 400).sort((a, b) => a - b),
    };
}

module.exports = AnnotationExtractor;
module.exports.detectStatusesFromBody = detectStatusesFromBody;
module.exports.HTTP_STATUS_CODES = HTTP_STATUS_CODES;
module.exports.FRAMEWORK_PARAM_TYPES = FRAMEWORK_PARAM_TYPES;
