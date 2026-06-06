const BaseStrategy = require('./base-strategy');
const ControllerScanner = require('../parser/controller-scanner');
const JavaFileParser = require('../parser/java-parser');
const AnnotationExtractor = require('../parser/annotation-extractor');
const TypeResolver = require('../parser/type-resolver');
const DtoScanner = require('../parser/dto-scanner');
const {
    createEmptyIR,
    createEndpoint,
    createParameter,
    createRequestBody,
    addEndpoint,
    addSchema,
    setServerUrl,
} = require('../ir/models');
const OpenApiBuilder = require('../ir/openapi-builder');
const OpenApiConverter = require('../openapi/converter');
const MockDataGenerator = require('../generator/mock-generator');
const PostmanEnhancer = require('../postman/postman-enhancer');
const { loadProjectConfig } = require('../config/project-config');

class ParserStrategy extends BaseStrategy {
    constructor(source, logger) {
        super(source, logger);
        this.scanner = new ControllerScanner(logger);
        this.javaParser = new JavaFileParser(logger);
        this.annotationExtractor = new AnnotationExtractor(logger);
        this.typeResolver = new TypeResolver(logger);
        this.dtoScanner = new DtoScanner(logger);
        this.openApiBuilder = new OpenApiBuilder(logger);
        this.converter = new OpenApiConverter(logger);
        this.mockGenerator = new MockDataGenerator(logger);
        this.postmanEnhancer = new PostmanEnhancer(logger, this.mockGenerator);
    }

    async validate(options = {}) {
        try {
            const controllers = await this.scanner.findControllers(this.source);
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

        const projectConfig = await loadProjectConfig(this.source);
        const collectionTitle = projectConfig.appName || 'Spring Boot API';
        const baseUrl = options.baseUrl || projectConfig.baseUrl;

        if (options.seed !== undefined) {
            this.mockGenerator.setSeed(options.seed);
        }

        let ir = createEmptyIR(collectionTitle, '1.0.0');

        if (baseUrl) {
            ir = setServerUrl(ir, baseUrl);
        }

        const concurrency = parseInt(options.concurrency, 10) || 5;

        this.logger.updateSpinner('Scanning for DTOs...');
        await this.dtoScanner.scanProject(this.source);

        this.logger.updateSpinner('Scanning for controllers...');
        const controllers = await this.scanner.findControllers(this.source, {
            include: options.include,
            exclude: options.exclude,
        });
        this.logger.info(`Found ${controllers.length} controller(s)`);

        const totalControllers = controllers.length;
        let processedCount = 0;
        let totalEndpoints = 0;

        const results = await this.parseControllersParallel(
            controllers,
            concurrency,
            (completed, total, filename) => {
                processedCount = completed;
                this.logger.updateSpinner(
                    `Parsing controllers... (${completed}/${total}) ${filename}`,
                );
            },
        );

        for (const result of results) {
            if (result.success) {
                for (const endpoint of result.endpoints) {
                    ir = addEndpoint(ir, endpoint);
                    totalEndpoints++;
                }
                this.logger.debug(`  → ${result.filename}: ${result.endpoints.length} endpoint(s)`);
            } else {
                this.logger.warn(`Failed to parse ${result.filename}: ${result.error}`);
            }
        }

        this.logger.info(
            `Parsed ${processedCount}/${totalControllers} controllers, extracted ${totalEndpoints} endpoints`,
        );

        ir = this.populateSchemas(ir);

        this.logger.updateSpinner('Converting to OpenAPI format...');
        const openApiSpec = this.openApiBuilder.buildFromIR(ir);

        if (options.format === 'openapi') {
            return openApiSpec;
        }

        this.logger.updateSpinner('Converting to Postman collection...');
        let collection = await this.converter.convert(openApiSpec, options);

        if (baseUrl) {
            collection = this.converter.applyBaseUrl(collection, baseUrl);
        }

        if (options.enhance !== false) {
            this.logger.updateSpinner('Enhancing Postman collection...');
            collection = this.postmanEnhancer.enhance(collection, options);
        }

        return collection;
    }

    async parseControllersParallel(controllers, concurrency, onProgress) {
        const results = [];
        const queue = [...controllers];
        let completed = 0;
        const total = controllers.length;

        const workers = [];
        for (let i = 0; i < Math.min(concurrency, total); i++) {
            workers.push(
                this.createWorker(queue, results, (filename) => {
                    completed++;
                    onProgress(completed, total, filename);
                }),
            );
        }

        await Promise.all(workers);
        return results;
    }

    async createWorker(queue, results, onComplete) {
        while (queue.length > 0) {
            const controllerPath = queue.shift();
            if (!controllerPath) break;

            const filename = controllerPath.split(/[/\\]/).pop();

            try {
                const endpoints = await this.parseController(controllerPath);
                results.push({
                    success: true,
                    filename,
                    endpoints,
                });
            } catch (error) {
                results.push({
                    success: false,
                    filename,
                    error: error.message,
                });
            }

            onComplete(filename);
        }
    }

    async parseController(filepath) {
        const endpoints = [];

        const parsed = await this.javaParser.parseFile(filepath);
        const { classInfo, content } = parsed;

        const basePath = this.annotationExtractor.extractBasePath(classInfo.annotations);
        this.logger.debug(`  Base path: ${basePath || '/'}`);

        const methods = await this.javaParser.extractMethods(content);
        this.logger.debug(`  Found ${methods.length} method(s)`);

        for (const method of methods) {
            const endpointInfos = this.annotationExtractor.extractEndpointInfos(method.annotations);

            for (const endpointInfo of endpointInfos) {
                endpoints.push(
                    this.buildEndpointFromMethod(method, endpointInfo, classInfo, basePath),
                );
            }
        }

        return endpoints;
    }

    buildEndpointFromMethod(method, endpointInfo, classInfo, basePath) {
        const fullPath = this.buildPath(basePath, endpointInfo.path);

        const endpoint = createEndpoint(
            endpointInfo.method,
            fullPath,
            this.generateEndpointName(method.name, endpointInfo.method),
        );

        endpoint.tags = [classInfo.className];

        const params = method.parameters || [];

        for (const param of params) {
            const paramInfos = this.annotationExtractor.extractParameterInfos(
                param.annotations,
                param.name,
                param.type,
            );

            for (const paramInfo of paramInfos) {
                if (paramInfo.in === 'body') {
                    const requestBody = createRequestBody(paramInfo.type, paramInfo.required);

                    const dtoFields = this.dtoScanner.inferDtoFields(paramInfo.type);
                    requestBody.example = this.mockGenerator.generateRequestExample(
                        paramInfo.type,
                        dtoFields,
                        endpointInfo.method,
                    );

                    endpoint.requestBody = requestBody;
                } else {
                    const parameter = createParameter(
                        paramInfo.name,
                        paramInfo.type,
                        paramInfo.in,
                        paramInfo.required,
                    );

                    const resolved = this.typeResolver.resolveType(paramInfo.type);
                    parameter.jsonType = resolved.type || 'string';
                    parameter.format = resolved.format;
                    parameter.example = this.mockGenerator.generateForField(
                        paramInfo.name,
                        paramInfo.type,
                    );

                    if (paramInfo.defaultValue !== undefined) {
                        parameter.defaultValue = paramInfo.defaultValue;
                    }

                    endpoint.parameters[paramInfo.in].push(parameter);
                }
            }
        }

        if (method.returnType && method.returnType !== 'void') {
            const responseSchema = this.typeResolver.resolveType(method.returnType);
            endpoint.responses = this.generateResponses(
                endpointInfo.method,
                method.returnType,
                fullPath,
            );
            endpoint.responses[0].schema = responseSchema;
        }

        return endpoint;
    }

    generateResponses(httpMethod, returnType, path) {
        const responses = [];
        const entityName = this.extractEntityName(returnType);
        const dtoFields = this.dtoScanner.inferDtoFields(entityName);

        switch (httpMethod) {
            case 'GET':
                if (returnType.includes('List<') || returnType.includes('Collection<')) {
                    responses.push({
                        status: 200,
                        description: 'Successful response',
                        contentType: 'application/json',
                        example: this.mockGenerator.generateListResponse(entityName, dtoFields),
                    });
                } else {
                    responses.push({
                        status: 200,
                        description: 'Successful response',
                        contentType: 'application/json',
                        example: this.mockGenerator.generateResponseExample(
                            entityName,
                            dtoFields,
                            'GET',
                        ),
                    });
                    responses.push({
                        status: 404,
                        description: 'Not found',
                        contentType: 'application/json',
                        example: this.mockGenerator.generateErrorResponse(
                            404,
                            `${entityName} not found`,
                            path,
                        ),
                    });
                }
                break;

            case 'POST':
                responses.push({
                    status: 201,
                    description: 'Created successfully',
                    contentType: 'application/json',
                    example: this.mockGenerator.generateResponseExample(
                        entityName,
                        dtoFields,
                        'POST',
                    ),
                });
                responses.push({
                    status: 400,
                    description: 'Bad request',
                    contentType: 'application/json',
                    example: this.mockGenerator.generateErrorResponse(
                        400,
                        'Validation failed',
                        path,
                    ),
                });
                break;

            case 'PUT':
            case 'PATCH':
                responses.push({
                    status: 200,
                    description: 'Updated successfully',
                    contentType: 'application/json',
                    example: this.mockGenerator.generateResponseExample(
                        entityName,
                        dtoFields,
                        httpMethod,
                    ),
                });
                responses.push({
                    status: 404,
                    description: 'Not found',
                    contentType: 'application/json',
                    example: this.mockGenerator.generateErrorResponse(
                        404,
                        `${entityName} not found`,
                        path,
                    ),
                });
                break;

            case 'DELETE':
                responses.push({
                    status: 204,
                    description: 'Deleted successfully',
                    contentType: 'application/json',
                });
                responses.push({
                    status: 404,
                    description: 'Not found',
                    contentType: 'application/json',
                    example: this.mockGenerator.generateErrorResponse(
                        404,
                        `${entityName} not found`,
                        path,
                    ),
                });
                break;

            default:
                responses.push({
                    status: 200,
                    description: 'Successful response',
                    contentType: 'application/json',
                });
        }

        return responses;
    }

    extractEntityName(returnType) {
        let type = returnType.trim();

        const wrappers = ['ResponseEntity<', 'Optional<', 'Mono<', 'Flux<'];
        for (const wrapper of wrappers) {
            if (type.startsWith(wrapper) && type.endsWith('>')) {
                type = type.slice(wrapper.length, -1).trim();
            }
        }

        if (type.startsWith('List<') || type.startsWith('Set<') || type.startsWith('Collection<')) {
            const inner = type.match(/<(.+)>$/)?.[1];
            if (inner) {
                return this.extractEntityName(inner);
            }
        }

        const genericIndex = type.indexOf('<');
        if (genericIndex > 0) {
            type = type.slice(0, genericIndex);
        }

        return type || 'Entity';
    }

    buildPath(basePath, endpointPath) {
        let base = (basePath || '').trim();
        let path = (endpointPath || '').trim();

        if (base.endsWith('/')) {
            base = base.slice(0, -1);
        }

        if (path && !path.startsWith('/')) {
            path = `/${path}`;
        }

        const fullPath = base + path;

        return fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
    }

    generateEndpointName(methodName, _httpMethod) {
        const words = methodName.replace(/([A-Z])/g, ' $1').trim();
        const titleCase = words.charAt(0).toUpperCase() + words.slice(1);

        return titleCase;
    }

    populateSchemas(ir) {
        const referencedTypes = this.collectReferencedTypes(ir);
        let result = ir;

        for (const [name, dto] of this.dtoScanner.dtoCache) {
            const schema = this.dtoScanner.generateSchemaFromDto(dto);
            result = addSchema(result, name, schema);
        }

        for (const typeName of referencedTypes) {
            if (result.schemas[typeName]) {
                continue;
            }

            const dto = this.dtoScanner.getDto(typeName);
            if (dto) {
                result = addSchema(result, typeName, this.dtoScanner.generateSchemaFromDto(dto));
            } else {
                const fields = this.dtoScanner.inferDtoFields(typeName);
                result = addSchema(
                    result,
                    typeName,
                    this.dtoScanner.generateSchemaFromFields(fields),
                );
            }
        }

        return result;
    }

    collectReferencedTypes(ir) {
        const types = new Set();

        for (const endpoint of ir.endpoints) {
            if (endpoint.requestBody?.schema?.$ref) {
                const match = endpoint.requestBody.schema.$ref.match(
                    /#\/components\/schemas\/(.+)$/,
                );
                if (match) types.add(match[1]);
            }

            for (const location of ['path', 'query', 'header']) {
                for (const param of endpoint.parameters[location] || []) {
                    if (this.typeResolver.needsSchema(param.javaType || param.type)) {
                        const baseType = (param.javaType || param.type).replace(/<.*>/, '').trim();
                        types.add(baseType);
                    }
                }
            }

            for (const response of endpoint.responses || []) {
                if (response.schema?.$ref) {
                    const match = response.schema.$ref.match(/#\/components\/schemas\/(.+)$/);
                    if (match) types.add(match[1]);
                }
            }
        }

        return types;
    }
}

module.exports = ParserStrategy;
