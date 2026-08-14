const { parseJavaType } = require('./java-type');

/**
 * Order matters throughout this module: wrapper types (ResponseEntity,
 * Optional, ...) are unwrapped structurally BEFORE collections are checked,
 * so `ResponseEntity<List<User>>` resolves to an array of User instead of
 * the nested array the old string matching produced.
 */

const PRIMITIVE_SCHEMAS = {
    String: { type: 'string' },
    CharSequence: { type: 'string' },
    char: { type: 'string' },
    Character: { type: 'string' },
    int: { type: 'integer', format: 'int32' },
    Integer: { type: 'integer', format: 'int32' },
    short: { type: 'integer', format: 'int32' },
    Short: { type: 'integer', format: 'int32' },
    long: { type: 'integer', format: 'int64' },
    Long: { type: 'integer', format: 'int64' },
    byte: { type: 'integer' },
    Byte: { type: 'integer' },
    float: { type: 'number', format: 'float' },
    Float: { type: 'number', format: 'float' },
    double: { type: 'number', format: 'double' },
    Double: { type: 'number', format: 'double' },
    Number: { type: 'number' },
    BigDecimal: { type: 'number' },
    BigInteger: { type: 'integer' },
    boolean: { type: 'boolean' },
    Boolean: { type: 'boolean' },
    Date: { type: 'string', format: 'date-time' },
    LocalDate: { type: 'string', format: 'date' },
    LocalDateTime: { type: 'string', format: 'date-time' },
    ZonedDateTime: { type: 'string', format: 'date-time' },
    OffsetDateTime: { type: 'string', format: 'date-time' },
    Instant: { type: 'string', format: 'date-time' },
    Timestamp: { type: 'string', format: 'date-time' },
    Calendar: { type: 'string', format: 'date-time' },
    LocalTime: { type: 'string', format: 'time' },
    OffsetTime: { type: 'string', format: 'time' },
    Duration: { type: 'string', description: 'ISO-8601 duration' },
    Period: { type: 'string', description: 'ISO-8601 period' },
    Year: { type: 'integer' },
    YearMonth: { type: 'string' },
    MonthDay: { type: 'string' },
    UUID: { type: 'string', format: 'uuid' },
    URI: { type: 'string', format: 'uri' },
    URL: { type: 'string', format: 'uri' },
    Locale: { type: 'string' },
    Currency: { type: 'string' },
    TimeZone: { type: 'string' },
    ZoneId: { type: 'string' },
    Object: { type: 'object' },
    JsonNode: { type: 'object' },
    ObjectNode: { type: 'object' },
    ArrayNode: { type: 'array', items: {} },
};

const WRAPPER_TYPES = new Set([
    'ResponseEntity',
    'HttpEntity',
    'RequestEntity',
    'Optional',
    'Mono',
    'CompletableFuture',
    'CompletionStage',
    'Callable',
    'DeferredResult',
    'Future',
    'ListenableFuture',
    'EntityModel',
]);

const STREAM_TYPES = new Set(['Flux', 'Stream', 'Observable', 'Flowable']);

const COLLECTION_TYPES = new Set([
    'List',
    'ArrayList',
    'LinkedList',
    'Set',
    'HashSet',
    'LinkedHashSet',
    'TreeSet',
    'SortedSet',
    'NavigableSet',
    'Collection',
    'Iterable',
    'Queue',
    'Deque',
    'CollectionModel',
]);

const MAP_TYPES = new Set([
    'Map',
    'HashMap',
    'LinkedHashMap',
    'TreeMap',
    'SortedMap',
    'NavigableMap',
    'ConcurrentHashMap',
    'ConcurrentMap',
    'MultiValueMap',
]);

const PAGE_TYPES = new Set(['Page', 'PageImpl', 'PagedModel']);
const SLICE_TYPES = new Set(['Slice', 'Window']);

const BINARY_TYPES = new Set([
    'MultipartFile',
    'Resource',
    'InputStreamResource',
    'ByteArrayResource',
    'FileSystemResource',
    'InputStream',
    'StreamingResponseBody',
]);

const VOID_TYPES = new Set(['void', 'Void']);

const REQUIRED_PRIMITIVES = new Set([
    'int',
    'long',
    'short',
    'byte',
    'float',
    'double',
    'boolean',
    'char',
]);

class TypeResolver {
    /**
     * @param {import('./source-index')} sourceIndex may be null when resolving
     *   without project context (primitives and structure only).
     */
    constructor(sourceIndex, logger) {
        this.index = sourceIndex;
        this.logger = logger;
        this.schemas = {};
        this.schemaNameByKey = new Map();
        this.unresolved = new Map();
        this.building = new Set();
    }

    /**
     * Resolve a Java type expression to a JSON schema.
     * Returns null when the type has no content (void).
     *
     * @param {string} typeText e.g. 'ResponseEntity<List<OrderResponse>>'
     * @param {object|null} contextModel file model of the referencing file
     * @param {object} [options] { location } for unresolved reporting
     */
    async resolveTypeText(typeText, contextModel, options = {}) {
        const parsed = parseJavaType(typeText);
        return this.resolveParsedType(parsed, contextModel, options);
    }

    async resolveParsedType(parsed, contextModel, options = {}) {
        if (!parsed) {
            return { type: 'object' };
        }

        // Arrays: byte[] is a base64 payload, everything else a JSON array.
        if (parsed.arrayDims > 0) {
            if (parsed.name === 'byte' && parsed.arrayDims === 1) {
                return { type: 'string', format: 'byte' };
            }
            const item = await this.resolveParsedType(
                { ...parsed, arrayDims: parsed.arrayDims - 1 },
                contextModel,
                options,
            );
            return { type: 'array', items: item || {} };
        }

        const { name, args } = parsed;

        if (VOID_TYPES.has(name)) {
            return null;
        }

        // Unwrap wrappers BEFORE any collection matching.
        if (WRAPPER_TYPES.has(name)) {
            if (args.length === 0) {
                return { type: 'object' };
            }
            return this.resolveParsedType(args[0], contextModel, options);
        }

        if (STREAM_TYPES.has(name)) {
            const item = await this.resolveParsedType(args[0], contextModel, options);
            return { type: 'array', items: item || {} };
        }

        if (COLLECTION_TYPES.has(name)) {
            const item = args[0]
                ? await this.resolveParsedType(args[0], contextModel, options)
                : {};
            return { type: 'array', items: item || {} };
        }

        if (MAP_TYPES.has(name)) {
            const valueSchema = args[1]
                ? await this.resolveParsedType(args[1], contextModel, options)
                : true;
            return {
                type: 'object',
                additionalProperties: valueSchema === null ? true : valueSchema,
            };
        }

        if (PAGE_TYPES.has(name) || SLICE_TYPES.has(name)) {
            const item = args[0]
                ? await this.resolveParsedType(args[0], contextModel, options)
                : {};
            const schema = {
                type: 'object',
                description: 'Spring Data page envelope',
                properties: {
                    content: { type: 'array', items: item || {} },
                    size: { type: 'integer', format: 'int32' },
                    number: { type: 'integer', format: 'int32' },
                    numberOfElements: { type: 'integer', format: 'int32' },
                    first: { type: 'boolean' },
                    last: { type: 'boolean' },
                    empty: { type: 'boolean' },
                },
            };
            if (PAGE_TYPES.has(name)) {
                schema.properties.totalElements = { type: 'integer', format: 'int64' };
                schema.properties.totalPages = { type: 'integer', format: 'int32' };
            }
            return schema;
        }

        if (PRIMITIVE_SCHEMAS[name]) {
            return { ...PRIMITIVE_SCHEMAS[name] };
        }

        if (BINARY_TYPES.has(name)) {
            return { type: 'string', format: 'binary' };
        }

        // Unsubstituted generic type parameters (T, ID, ...) — either declared
        // on the referencing type or matching the short-uppercase convention.
        if (
            (options.typeParameters && options.typeParameters.includes(name)) ||
            /^[A-Z][A-Z0-9]?$/.test(name)
        ) {
            this.recordUnresolved(name, options.location, 'generic type parameter');
            return { type: 'object' };
        }

        // Custom project type.
        if (this.index) {
            const resolved = await this.index.resolveType(
                parsed.qualified || name,
                contextModel,
            );
            if (resolved) {
                return this.registerTypeSchema(resolved, options);
            }
        }

        this.recordUnresolved(parsed.qualified || name, options.location, 'type not found');
        return { type: 'object' };
    }

    /**
     * Register a named component schema for a resolved project type and
     * return a $ref to it. Handles name collisions across packages and
     * self-referencing (recursive) types.
     */
    async registerTypeSchema(typeEntry, options = {}) {
        const { type, model } = typeEntry;
        const key = `${model.filePath}#${type.name}`;

        if (this.schemaNameByKey.has(key)) {
            return { $ref: `#/components/schemas/${this.schemaNameByKey.get(key)}` };
        }

        let schemaName = type.simpleName;
        let suffix = 2;
        while (Object.prototype.hasOwnProperty.call(this.schemas, schemaName)) {
            schemaName = `${type.simpleName}_${suffix++}`;
        }

        this.schemaNameByKey.set(key, schemaName);
        // Reserve before building so cycles resolve to the $ref.
        this.schemas[schemaName] = { type: 'object' };

        if (type.kind === 'enum') {
            this.schemas[schemaName] = {
                type: 'string',
                enum: [...type.enumConstants],
            };
        } else if (type.kind === 'interface') {
            this.schemas[schemaName] = await this.buildInterfaceSchema(typeEntry, options);
        } else {
            this.schemas[schemaName] = await this.buildObjectSchema(typeEntry, options);
        }

        return { $ref: `#/components/schemas/${schemaName}` };
    }

    async buildObjectSchema(typeEntry, options = {}) {
        const fields = await this.index.collectFields(typeEntry);

        const properties = {};
        const required = [];

        for (const field of fields) {
            if (field.isStatic || field.isTransient) {
                continue;
            }
            if (field.annotations.some((a) => a.name === 'JsonIgnore')) {
                continue;
            }

            const jsonProperty = field.annotations.find((a) => a.name === 'JsonProperty');
            const propName =
                typeof jsonProperty?.attributes?.value === 'string'
                    ? jsonProperty.attributes.value
                    : field.name;

            const fieldModel = field.declaringModel || typeEntry.model;
            let schema = await this.resolveTypeText(field.type, fieldModel, {
                ...options,
                location: `${typeEntry.type.name}.${field.name}`,
            });
            if (!schema) {
                schema = { type: 'object' };
            }

            schema = applyValidationConstraints(schema, field.annotations);
            properties[propName] = schema;

            if (isFieldRequired(field)) {
                required.push(propName);
            }
        }

        const schema = { type: 'object', properties };
        if (required.length > 0) {
            schema.required = required;
        }
        return schema;
    }

    /**
     * Interface DTOs (Spring Data projections) expose their shape through
     * zero-argument getters.
     */
    async buildInterfaceSchema(typeEntry, options = {}) {
        const { type, model } = typeEntry;
        const properties = {};

        for (const method of type.methods) {
            if (method.parameters.length > 0 || method.isStatic) {
                continue;
            }
            const getterMatch = method.name.match(/^(?:get|is)([A-Z].*)$/);
            if (!getterMatch || method.returnType === 'void') {
                continue;
            }
            const propName = getterMatch[1].charAt(0).toLowerCase() + getterMatch[1].slice(1);
            const schema = await this.resolveTypeText(method.returnType, model, {
                ...options,
                location: `${type.name}.${method.name}`,
            });
            properties[propName] = schema || { type: 'object' };
        }

        return { type: 'object', properties };
    }

    recordUnresolved(name, location, reason) {
        if (!this.unresolved.has(name)) {
            this.unresolved.set(name, { reason, locations: new Set() });
        }
        if (location) {
            this.unresolved.get(name).locations.add(location);
        }
    }

    getUnresolvedTypes() {
        return [...this.unresolved.entries()].map(([name, info]) => ({
            name,
            reason: info.reason,
            locations: [...info.locations],
        }));
    }

    getSchemas() {
        return this.schemas;
    }
}

function isFieldRequired(field) {
    const parsed = parseJavaType(field.type);
    if (parsed && parsed.arrayDims === 0 && REQUIRED_PRIMITIVES.has(parsed.name)) {
        return true;
    }
    return field.annotations.some((a) =>
        ['NotNull', 'NotBlank', 'NotEmpty'].includes(a.name),
    );
}

/**
 * Map Bean Validation annotations onto JSON schema constraints.
 * Constraints are skipped for $ref schemas (siblings of $ref are ignored
 * in OpenAPI 3.0).
 */
function applyValidationConstraints(schema, annotations) {
    if (!annotations || annotations.length === 0 || schema.$ref) {
        return schema;
    }

    const result = { ...schema };
    const isString = result.type === 'string';
    const isArray = result.type === 'array';
    const isNumeric = result.type === 'integer' || result.type === 'number';

    for (const annotation of annotations) {
        const attrs = annotation.attributes || {};
        switch (annotation.name) {
            case 'NotBlank':
                if (isString) {
                    result.minLength = Math.max(result.minLength || 0, 1);
                }
                break;
            case 'NotEmpty':
                if (isString) {
                    result.minLength = Math.max(result.minLength || 0, 1);
                } else if (isArray) {
                    result.minItems = Math.max(result.minItems || 0, 1);
                }
                break;
            case 'Size':
                if (isString) {
                    if (typeof attrs.min === 'number') result.minLength = attrs.min;
                    if (typeof attrs.max === 'number') result.maxLength = attrs.max;
                } else if (isArray) {
                    if (typeof attrs.min === 'number') result.minItems = attrs.min;
                    if (typeof attrs.max === 'number') result.maxItems = attrs.max;
                }
                break;
            case 'Min':
                if (isNumeric && typeof attrs.value === 'number') {
                    result.minimum = attrs.value;
                }
                break;
            case 'Max':
                if (isNumeric && typeof attrs.value === 'number') {
                    result.maximum = attrs.value;
                }
                break;
            case 'DecimalMin':
                if (isNumeric && attrs.value !== undefined) {
                    const min = parseFloat(attrs.value);
                    if (!Number.isNaN(min)) result.minimum = min;
                }
                break;
            case 'DecimalMax':
                if (isNumeric && attrs.value !== undefined) {
                    const max = parseFloat(attrs.value);
                    if (!Number.isNaN(max)) result.maximum = max;
                }
                break;
            case 'Positive':
                if (isNumeric) {
                    result.minimum = 0;
                    result.exclusiveMinimum = true;
                }
                break;
            case 'PositiveOrZero':
                if (isNumeric) {
                    result.minimum = 0;
                }
                break;
            case 'Negative':
                if (isNumeric) {
                    result.maximum = 0;
                    result.exclusiveMaximum = true;
                }
                break;
            case 'NegativeOrZero':
                if (isNumeric) {
                    result.maximum = 0;
                }
                break;
            case 'Email':
                if (isString) {
                    result.format = 'email';
                }
                break;
            case 'Pattern':
                if (isString && typeof attrs.regexp === 'string') {
                    result.pattern = attrs.regexp;
                }
                break;
            default:
                break;
        }
    }

    return result;
}

module.exports = TypeResolver;
module.exports.applyValidationConstraints = applyValidationConstraints;
module.exports.isFieldRequired = isFieldRequired;
module.exports.PRIMITIVE_SCHEMAS = PRIMITIVE_SCHEMAS;
