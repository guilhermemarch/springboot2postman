const { isUrl, resolvePath, isFile } = require('./file-utils');
const OpenApiStrategy = require('../core/strategies/openapi-strategy');
const { findOpenApiSpec } = require('../core/openapi/discovery');

async function detectStrategy(project, logger, options = {}) {
    logger.debug('Detecting strategy...');

    if (isUrl(project)) {
        logger.debug('Input is URL, trying OpenAPI strategy...');
        const strategy = new OpenApiStrategy(project, logger);
        if (await strategy.validate(options)) {
            return strategy;
        }
    }

    if (await isFile(project)) {
        logger.debug('Input is file, trying OpenAPI strategy...');
        const strategy = new OpenApiStrategy(project, logger);
        if (await strategy.validate(options)) {
            return strategy;
        }
        return null;
    }

    const openApiPath = await findOpenApiSpec(project);
    if (openApiPath) {
        logger.debug(`Found OpenAPI spec: ${openApiPath}`);
        const strategy = new OpenApiStrategy(openApiPath, logger);
        if (await strategy.validate(options)) {
            return strategy;
        }
    }

    logger.debug('OpenAPI not found, trying parser strategy...');
    const ParserStrategy = require('../core/strategies/parser-strategy');
    const parserStrategy = new ParserStrategy(project, logger);

    if (await parserStrategy.validate(options)) {
        logger.debug('Found Spring Boot controllers');
        return parserStrategy;
    }

    return null;
}

function resolveProjectPath(project) {
    return resolvePath(project);
}

module.exports = {
    detectStrategy,
    resolveProjectPath,
};
