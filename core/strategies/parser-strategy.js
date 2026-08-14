const BaseStrategy = require('./base-strategy');
const ControllerScanner = require('../parser/controller-scanner');
const AnnotationExtractor = require('../parser/annotation-extractor');
const { detectStatusesFromBody } = require('../parser/annotation-extractor');
const SourceIndex = require('../parser/source-index');
const TypeResolver = require('../parser/type-resolver');
const { parseJavaType, substituteInText, typeToString } = require('../parser/java-type');
const {
    createIR,
    createEndpoint,
    createParameter,
    createRequestBody,
    createResponse,
} = require('../ir/models');
const OpenApiBuilder = require('../ir/openapi-builder');
const OpenApiConverter = require('../openapi/converter');
const ExampleGenerator = require('../generator/mock-generator');
const PostmanEnhancer = require('../postman/postman-enhancer');
const RunReport = require('../report/run-report');
const { renderHttpFile } = require('../output/http-format');
const { loadProjectConfig } = require('../config/project-config');
const { pathExists, isDirectory } = require('../../lib/file-utils');
const { ProjectNotFoundError } = require('../../lib/errors');

const MAPPING_ANNOTATION_NAMES = new Set([
    'RequestMapping',
    'GetMapping',
    'PostMapping',
    'PutMapping',
    'DeleteMapping',
    'PatchMapping',
]);

class ParserStrategy extends BaseStrategy {
    constructor(source, logger) {
        super(source, logger);
        this.scanner = new ControllerScanner(logger);
        this.annotations = new AnnotationExtractor(logger);
        this.converter = new OpenApiConverter(logger);
        this.builder = new OpenApiBuilder(logger);
        this.enhancer = new PostmanEnhancer(logger);
        this._index = null;
    }

    async getIndex() {
        if (!this._index) {
            this._index = await new SourceIndex(this.logger).build(this.source);
        }
        return this._index;
    }

    async validate(options = {}) {
        try {
            if (!(await pathExists(this.source)) || !(await isDirectory(this.source))) {
                return false;
            }
            const index = await this.getIndex();
            const controllers = await this.scanner.findControllers(index, options);
            return controllers.length > 0;
        } catch (error) {
            if (options.verbose) {
                this.logger.debug(`Parser validation failed: ${error.message}`);
            }
            return false;
        }
    }

    async extract(options = {}) {
        this.logger.debug('Using Parser strategy');

        if (!(await pathExists(this.source)) || !(await isDirectory(this.source))) {
            throw new ProjectNotFoundError(this.source);
        }

        const report = new RunReport();
        report.strategy = 'parser';

        const projectConfig = await loadProjectConfig(this.source);
        const title = projectConfig.appName || 'Spring Boot API';
        const baseUrl = options.baseUrl || projectConfig.baseUrl;

        const examples = new ExampleGenerator(this.logger);
        examples.setSeed(options.seed !== undefined ? options.seed : 1);

        const index = await this.getIndex();
        const resolver = new TypeResolver(index, this.logger);

        this.logger.updateSpinner('Scanning for controllers...');
        const controllerFiles = await this.scanner.findControllers(index, {
            include: options.include,
            exclude: options.exclude,
        });
        report.controllersScanned = controllerFiles.length;
        this.logger.info(`Found ${controllerFiles.length} controller file(s)`);

        const ir = createIR({ title, version: '1.0.0', serverUrl: baseUrl });

        const concurrency = Math.max(parseInt(options.concurrency, 10) || 5, 1);
        const queue = [...controllerFiles];
        let processed = 0;

        const worker = async () => {
            while (queue.length > 0) {
                const file = queue.shift();
                if (!file) {
                    break;
                }
                const shortName = file.split(/[/\\]/).pop();
                try {
                    const endpoints = await this.extractFromFile(file, index, resolver, report);
                    ir.endpoints.push(...endpoints);
                } catch (error) {
                    report.setSkippedFiles([
                        ...report.skippedFiles,
                        { file, reason: error.message },
                    ]);
                }
                processed++;
                this.logger.updateSpinner(
                    `Parsing controllers... (${processed}/${controllerFiles.length}) ${shortName}`,
                );
            }
        };

        await Promise.all(
            Array.from({ length: Math.min(concurrency, controllerFiles.length) }, worker),
        );

        // Stable output: order endpoints by path then method.
        ir.endpoints.sort(
            (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
        );

        ir.schemas = Object.fromEntries(
            Object.entries(resolver.getSchemas()).sort(([a], [b]) => a.localeCompare(b)),
        );

        // Examples are generated in a single deterministic pass AFTER
        // sorting, so concurrency never affects seeded faker output.
        this.fillExamples(ir, examples);

        report.endpoints = ir.endpoints.length;
        report.schemaCount = Object.keys(ir.schemas).length;
        report.setUnresolvedTypes(resolver.getUnresolvedTypes());
        report.setSkippedFiles([...report.skippedFiles, ...index.getFailedFiles()]);

        this.logger.updateSpinner('Building OpenAPI specification...');
        const spec = this.builder.buildFromIR(ir, report);

        if (options.format === 'openapi') {
            return { output: spec, spec, report };
        }

        if (options.format === 'http') {
            return { output: renderHttpFile(spec, examples), spec, report };
        }

        this.logger.updateSpinner('Converting to Postman collection...');
        let collection = await this.converter.convert(spec, options);

        if (baseUrl) {
            collection = this.converter.applyBaseUrl(collection, baseUrl);
        }

        if (options.enhance !== false) {
            collection = this.enhancer.enhance(collection, { baseUrl, spec });
        }

        return { output: collection, spec, report };
    }

    /**
     * Extract endpoints from every controller type in one file.
     */
    async extractFromFile(file, index, resolver, report) {
        const model = await index.getFileModel(file);
        if (!model) {
            return [];
        }

        const endpoints = [];
        for (const type of model.types) {
            if (!this.isControllerType(type)) {
                continue;
            }
            report.controllerTypes++;
            endpoints.push(
                ...(await this.buildEndpointsForController(type, model, index, resolver, report)),
            );
        }
        return endpoints;
    }

    isControllerType(type) {
        if (type.kind !== 'class' && type.kind !== 'record') {
            return false;
        }
        if (type.isAbstract) {
            return false;
        }

        const names = new Set(type.annotations.map((a) => a.name));
        if (names.has('RestControllerAdvice') || names.has('ControllerAdvice')) {
            return false;
        }
        if (names.has('RestController')) {
            return true;
        }
        if (names.has('Controller')) {
            return (
                names.has('ResponseBody') ||
                type.methods.some((m) => m.annotations.some((a) => a.name === 'ResponseBody'))
            );
        }
        return false;
    }

    async buildEndpointsForController(type, model, index, resolver, report) {
        const context = `${type.name}`;

        // Class-level mapping: own annotations, then API-first interfaces,
        // then superclasses.
        let classMapping = this.annotations.extractClassMapping(type.annotations);
        let classMappingSource = model;
        if (!this.hasRequestMapping(type)) {
            const inherited = await this.findInheritedClassMapping(type, model, index);
            if (inherited) {
                classMapping = inherited.mapping;
                classMappingSource = inherited.model;
            }
        }

        await this.resolveUnresolvedPaths(classMapping, classMappingSource, index, report, context);

        const effectiveMethods = await this.collectEffectiveMethods(type, model, index, report);

        const endpoints = [];
        for (const entry of effectiveMethods) {
            const infos = this.annotations.extractEndpointInfos(entry.method.annotations);

            // One method can expand to several endpoints (path arrays,
            // multiple class-level paths); disambiguate their names.
            const distinctSubPaths = new Set(infos.map((i) => i.path)).size > 1;
            const distinctBasePaths = classMapping.paths.length > 1;

            for (const info of infos) {
                await this.resolveUnresolvedEndpointPaths(
                    info,
                    entry.model,
                    index,
                    report,
                    context,
                );

                for (const basePath of classMapping.paths) {
                    const endpoint = await this.buildEndpoint({
                        type,
                        info,
                        basePath,
                        classMapping,
                        entry,
                        index,
                        resolver,
                        report,
                    });

                    if (distinctSubPaths || distinctBasePaths) {
                        const marker = distinctSubPaths ? info.path : basePath;
                        if (marker) {
                            endpoint.name = `${endpoint.name} (${marker})`;
                        }
                    }

                    endpoints.push(endpoint);
                }
            }
        }

        return endpoints;
    }

    hasRequestMapping(type) {
        return type.annotations.some((a) => a.name === 'RequestMapping');
    }

    async findInheritedClassMapping(type, model, index, seen = new Set()) {
        const candidates = [...(type.interfaces || [])];
        if (type.superclass) {
            candidates.push(type.superclass);
        }

        for (const candidate of candidates) {
            const baseName = candidate.split('<')[0];
            if (seen.has(baseName)) {
                continue;
            }
            seen.add(baseName);

            const resolved = await index.resolveType(baseName, model);
            if (!resolved) {
                continue;
            }
            if (this.hasRequestMapping(resolved.type)) {
                return {
                    mapping: this.annotations.extractClassMapping(resolved.type.annotations),
                    model: resolved.model,
                };
            }
            const deeper = await this.findInheritedClassMapping(
                resolved.type,
                resolved.model,
                index,
                seen,
            );
            if (deeper) {
                return deeper;
            }
        }

        return null;
    }

    async resolveUnresolvedPaths(mapping, model, index, report, context) {
        for (const ref of mapping.unresolvedPaths || []) {
            const value = await index.resolveConstant(ref, model);
            if (typeof value === 'string') {
                if (mapping.paths.length === 1 && mapping.paths[0] === '') {
                    mapping.paths = [value];
                } else {
                    mapping.paths.push(value);
                }
            } else {
                report.addWarning(`Could not resolve path constant "${ref}" used by ${context}`);
            }
        }
        mapping.unresolvedPaths = [];
    }

    async resolveUnresolvedEndpointPaths(info, model, index, report, context) {
        for (const ref of info.unresolvedPaths || []) {
            const value = await index.resolveConstant(ref, model);
            if (typeof value === 'string') {
                if (info.path === '') {
                    info.path = value;
                } else {
                    report.addWarning(
                        `Multiple constant paths on one mapping in ${context}; ` +
                            `using "${info.path}"`,
                    );
                }
            } else {
                report.addWarning(`Could not resolve path constant "${ref}" used by ${context}`);
            }
        }
        info.unresolvedPaths = [];
    }

    /**
     * Own methods, plus inherited handler methods from superclasses (with
     * generic type substitution), plus mapping definitions from implemented
     * interfaces (API-first style).
     *
     * Returns [{ method, model, substitution }].
     */
    async collectEffectiveMethods(type, model, index, report) {
        const result = [];
        const coveredNames = new Set();

        const interfaceMethods = await this.collectInterfaceMethods(type, model, index);

        for (const method of type.methods) {
            if (method.isStatic) {
                continue;
            }
            const hasMapping = method.annotations.some((a) => MAPPING_ANNOTATION_NAMES.has(a.name));
            if (hasMapping) {
                result.push({ method, model, substitution: {} });
                coveredNames.add(method.name);
                continue;
            }

            // API-first: the mapping lives on the interface method.
            const fromInterface = interfaceMethods.get(method.name);
            if (fromInterface) {
                result.push(fromInterface);
                coveredNames.add(method.name);
            }
        }

        // Interface default methods with mappings not overridden in the class.
        for (const [name, entry] of interfaceMethods) {
            if (!coveredNames.has(name)) {
                result.push(entry);
                coveredNames.add(name);
            }
        }

        // Inherited handler methods from superclass chain.
        await this.collectSuperclassMethods(
            type,
            model,
            index,
            result,
            coveredNames,
            {},
            new Set(),
        );

        return result;
    }

    async collectInterfaceMethods(
        type,
        model,
        index,
        out = new Map(),
        substitution = {},
        seen = new Set(),
    ) {
        for (const ifaceText of type.interfaces || []) {
            const baseName = ifaceText.split('<')[0];
            if (seen.has(baseName)) {
                continue;
            }
            seen.add(baseName);

            const resolved = await index.resolveType(baseName, model);
            if (!resolved || resolved.type.kind !== 'interface') {
                continue;
            }

            const mapping = this.buildSubstitutionMap(ifaceText, resolved.type, substitution);

            for (const method of resolved.type.methods) {
                const hasMapping = method.annotations.some((a) =>
                    MAPPING_ANNOTATION_NAMES.has(a.name),
                );
                if (hasMapping && !out.has(method.name)) {
                    out.set(method.name, {
                        method,
                        model: resolved.model,
                        substitution: mapping,
                    });
                }
            }

            await this.collectInterfaceMethods(
                resolved.type,
                resolved.model,
                index,
                out,
                mapping,
                seen,
            );
        }

        return out;
    }

    async collectSuperclassMethods(type, model, index, result, coveredNames, substitution, seen) {
        if (!type.superclass) {
            return;
        }
        const baseName = type.superclass.split('<')[0];
        if (seen.has(baseName)) {
            return;
        }
        seen.add(baseName);

        const resolved = await index.resolveType(baseName, model);
        if (!resolved) {
            return;
        }

        const mapping = this.buildSubstitutionMap(type.superclass, resolved.type, substitution);

        for (const method of resolved.type.methods) {
            if (method.isStatic || coveredNames.has(method.name)) {
                continue;
            }
            const hasMapping = method.annotations.some((a) => MAPPING_ANNOTATION_NAMES.has(a.name));
            if (!hasMapping) {
                continue;
            }
            // Resolve inherited signatures against the subclass file context:
            // the substituted types are written there.
            result.push({ method, model, substitution: mapping });
            coveredNames.add(method.name);
        }

        await this.collectSuperclassMethods(
            resolved.type,
            resolved.model,
            index,
            result,
            coveredNames,
            mapping,
            seen,
        );
    }

    /**
     * Map a parent's type parameters to the concrete arguments used by the
     * child, composing with an existing substitution when chains are deep.
     */
    buildSubstitutionMap(referenceText, parentType, existingSubstitution) {
        const parsed = parseJavaType(referenceText);
        const mapping = {};

        (parentType.typeParameters || []).forEach((paramName, i) => {
            const arg = parsed?.args?.[i];
            if (arg) {
                mapping[paramName] = arg;
            }
        });

        // Compose: substitute existing mappings into the new arguments.
        for (const [key, value] of Object.entries(mapping)) {
            const substituted = substituteInText(typeToString(value), existingSubstitution);
            mapping[key] = parseJavaType(substituted);
        }

        return mapping;
    }

    async buildEndpoint({ type, info, basePath, classMapping, entry, index, resolver, report }) {
        const { method, model, substitution } = entry;
        const location = `${type.name}.${method.name}`;

        const fullPath = this.buildPath(basePath, info.path);
        const javadoc = method.javadoc || {};

        const endpoint = createEndpoint({
            method: info.method,
            path: fullPath,
            name: this.humanizeName(method.name),
            description: javadoc.description || '',
            operationId: method.name,
            tags: [this.tagForController(type)],
            deprecated:
                this.annotations.isDeprecated(method.annotations) || Boolean(javadoc.deprecated),
        });

        const produces = info.produces.length > 0 ? info.produces : classMapping.produces;
        const consumes = info.consumes.length > 0 ? info.consumes : classMapping.consumes;

        const multipartParts = [];
        let bodyInfo = null;

        for (const param of method.parameters) {
            const substType = substituteInText(param.type, substitution);
            const paramInfos = this.annotations.extractParameterInfos({
                name: param.name,
                type: substType,
                annotations: param.annotations,
            });

            for (const paramInfo of paramInfos) {
                if (paramInfo.in === 'body') {
                    bodyInfo = paramInfo;
                } else if (paramInfo.in === 'part') {
                    multipartParts.push(
                        await this.buildMultipartPart(paramInfo, model, resolver, location),
                    );
                } else if (paramInfo.in === 'modelAttribute') {
                    endpoint.parameters.query.push(
                        ...(await this.expandModelAttribute(
                            paramInfo,
                            model,
                            index,
                            resolver,
                            report,
                            location,
                        )),
                    );
                } else {
                    endpoint.parameters[paramInfo.in].push(
                        await this.buildParameter(
                            paramInfo,
                            model,
                            resolver,
                            javadoc,
                            param.name,
                            location,
                        ),
                    );
                }
            }
        }

        // Path template variables not bound to any @PathVariable.
        this.addMissingPathParams(endpoint, fullPath);

        if (multipartParts.length > 0) {
            endpoint.requestBody = createRequestBody({
                contentType: consumes[0] || 'multipart/form-data',
                required: multipartParts.some((p) => p.required),
                multipartParts,
            });
        } else if (bodyInfo) {
            const schema =
                (await resolver.resolveTypeText(bodyInfo.type, model, { location })) || {
                    type: 'object',
                };
            endpoint.requestBody = createRequestBody({
                contentType: consumes[0] || 'application/json',
                schema,
                required: bodyInfo.required,
            });
        }

        await this.buildResponses(endpoint, method, model, resolver, {
            produces,
            substitution,
            location,
        });

        return endpoint;
    }

    async buildParameter(paramInfo, model, resolver, javadoc, sourceParamName, location) {
        const schema =
            (await resolver.resolveTypeText(paramInfo.type, model, { location })) || {
                type: 'string',
            };

        const description =
            paramInfo.description || (javadoc.params && javadoc.params[sourceParamName]) || '';

        let defaultValue = paramInfo.defaultValue;
        if (typeof defaultValue === 'string') {
            if (schema.type === 'integer' || schema.type === 'number') {
                const numeric = Number(defaultValue);
                if (!Number.isNaN(numeric)) {
                    defaultValue = numeric;
                }
            } else if (schema.type === 'boolean') {
                if (defaultValue === 'true') defaultValue = true;
                else if (defaultValue === 'false') defaultValue = false;
            }
        }

        return createParameter({
            name: paramInfo.name,
            location: paramInfo.in,
            required: paramInfo.in === 'path' ? true : paramInfo.required,
            schema,
            description,
            defaultValue,
        });
    }

    async buildMultipartPart(paramInfo, model, resolver, location) {
        const baseType = paramInfo.type.split('<')[0].replace(/\[\]/g, '');
        let schema;
        if (baseType === 'MultipartFile') {
            schema = { type: 'string', format: 'binary' };
            if (paramInfo.type.startsWith('List<') || paramInfo.type.endsWith('[]')) {
                schema = { type: 'array', items: schema };
            }
        } else {
            schema = (await resolver.resolveTypeText(paramInfo.type, model, { location })) || {
                type: 'string',
            };
        }
        return { name: paramInfo.name, schema, required: paramInfo.required };
    }

    /**
     * Expand a @ModelAttribute (or unannotated POJO) into individual query
     * parameters from its fields — or a single parameter when it turns out
     * to be an enum.
     */
    async expandModelAttribute(paramInfo, model, index, resolver, report, location) {
        const baseName = paramInfo.type.split('<')[0];
        const resolved = await index.resolveType(baseName, model);

        if (!resolved) {
            report.addWarning(
                `Could not resolve @ModelAttribute type "${paramInfo.type}" at ${location}; ` +
                    'parameters omitted',
            );
            return [];
        }

        if (resolved.type.kind === 'enum') {
            const schema = await resolver.resolveTypeText(paramInfo.type, model, { location });
            return [
                createParameter({
                    name: paramInfo.name,
                    location: 'query',
                    required: false,
                    schema: schema || { type: 'string' },
                }),
            ];
        }

        const fields = await index.collectFields(resolved);
        const params = [];

        for (const field of fields) {
            if (field.isStatic || field.isTransient) {
                continue;
            }
            const fieldModel = field.declaringModel || resolved.model;
            const schema = await resolver.resolveTypeText(field.type, fieldModel, {
                location: `${location} (${baseName}.${field.name})`,
            });
            if (!schema) {
                continue;
            }

            const isSimple =
                ['string', 'integer', 'number', 'boolean'].includes(schema.type) ||
                (schema.$ref && (await this.isEnumRef(schema.$ref, resolver)));

            if (!isSimple) {
                this.logger.debug(
                    `Skipping nested field ${baseName}.${field.name} in query expansion`,
                );
                continue;
            }

            params.push(
                createParameter({
                    name: field.name,
                    location: 'query',
                    required: false,
                    schema,
                }),
            );
        }

        return params;
    }

    async isEnumRef(ref, resolver) {
        const name = ref.split('/').pop();
        const schema = resolver.getSchemas()[name];
        return Boolean(schema && Array.isArray(schema.enum));
    }

    addMissingPathParams(endpoint, fullPath) {
        const declared = new Set(endpoint.parameters.path.map((p) => p.name));
        const matches = fullPath.matchAll(/\{(\w+)\}/g);
        for (const match of matches) {
            if (!declared.has(match[1])) {
                endpoint.parameters.path.push(
                    createParameter({
                        name: match[1],
                        location: 'path',
                        required: true,
                        schema: { type: 'string' },
                    }),
                );
            }
        }
    }

    async buildResponses(endpoint, method, model, resolver, options) {
        const { produces, substitution, location } = options;

        const returnType = substituteInText(method.returnType, substitution);
        const schema = await resolver.resolveTypeText(returnType, model, { location });

        const annotationStatus = this.annotations.extractResponseStatus(method.annotations);
        const bodyStatuses = detectStatusesFromBody(method.bodyText);

        let successStatuses;
        if (annotationStatus !== null) {
            successStatuses = [annotationStatus];
        } else if (bodyStatuses.success.length > 0) {
            successStatuses = bodyStatuses.success;
        } else {
            successStatuses = [200];
        }

        const contentType = produces[0] || (schema ? 'application/json' : null);

        for (const status of successStatuses) {
            const hasBody = schema && status !== 204 && status !== 205 && status !== 304;
            endpoint.responses.push(
                createResponse({
                    status,
                    contentType: hasBody ? contentType : null,
                    schema: hasBody ? schema : null,
                }),
            );
        }

        // Error statuses observed in the method body (source-derived).
        for (const status of bodyStatuses.errors) {
            endpoint.responses.push(createResponse({ status }));
        }
    }

    /**
     * Deterministic example pass: runs over sorted endpoints so seeded
     * faker output does not depend on parsing concurrency.
     */
    fillExamples(ir, examples) {
        for (const endpoint of ir.endpoints) {
            for (const location of ['path', 'query', 'header', 'cookie']) {
                for (const param of endpoint.parameters[location]) {
                    if (param.example !== undefined) {
                        continue;
                    }
                    if (param.defaultValue !== undefined) {
                        param.example = param.defaultValue;
                    } else {
                        const example = examples.fromSchema(param.schema, ir.schemas, param.name);
                        if (example !== null && example !== undefined) {
                            param.example = example;
                        }
                    }
                }
            }

            const body = endpoint.requestBody;
            if (body && body.schema && body.example === undefined) {
                const example = examples.fromSchema(body.schema, ir.schemas);
                if (example !== null && example !== undefined) {
                    body.example = example;
                }
            }

            for (const response of endpoint.responses) {
                if (response.schema && response.example === undefined) {
                    const example = examples.fromSchema(response.schema, ir.schemas);
                    if (example !== null && example !== undefined) {
                        response.example = example;
                    }
                }
            }
        }
    }

    buildPath(basePath, endpointPath) {
        let base = (basePath || '').trim();
        let sub = (endpointPath || '').trim();

        if (base && !base.startsWith('/')) {
            base = `/${base}`;
        }
        if (base.endsWith('/')) {
            base = base.slice(0, -1);
        }
        if (sub && !sub.startsWith('/')) {
            sub = `/${sub}`;
        }

        let fullPath = `${base}${sub}` || '/';
        if (!fullPath.startsWith('/')) {
            fullPath = `/${fullPath}`;
        }

        // Normalize duplicate slashes and regex-constrained variables
        // ({id:\\d+} -> {id}).
        return fullPath.replace(/\/{2,}/g, '/').replace(/\{(\w+):[^}]*\}/g, '{$1}');
    }

    humanizeName(methodName) {
        const words = methodName
            .replace(/_/g, ' ')
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        return words.charAt(0).toUpperCase() + words.slice(1);
    }

    tagForController(type) {
        const stripped = type.simpleName.replace(
            /(RestController|Controller|Resource|Endpoint|Api)$/,
            '',
        );
        const base = stripped || type.simpleName;
        return base.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    }
}

module.exports = ParserStrategy;
