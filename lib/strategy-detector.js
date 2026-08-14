const { isUrl, resolvePath, isFile, isDirectory, pathExists } = require('./file-utils');
const OpenApiStrategy = require('../core/strategies/openapi-strategy');
const { findOpenApiSpec } = require('../core/openapi/discovery');

/**
 * @param {string} project URL, spec file path, or project directory
 * @param {object} options { strategy: 'auto'|'parser'|'openapi', verbose,
 *   headers, bearer }
 */
async function detectStrategy(project, logger, options = {}) {
    const mode = options.strategy || 'auto';
    logger.debug(`Detecting strategy (mode: ${mode})...`);

    const ParserStrategy = require('../core/strategies/parser-strategy');

    if (mode === 'parser') {
        const parserStrategy = new ParserStrategy(project, logger);
        if (await parserStrategy.validate(options)) {
            return parserStrategy;
        }
        return null;
    }

    if (isUrl(project)) {
        const strategy = new OpenApiStrategy(project, logger);
        if (await strategy.validate(options)) {
            return strategy;
        }
        return null;
    }

    if (await isFile(project)) {
        const strategy = new OpenApiStrategy(project, logger);
        if (await strategy.validate(options)) {
            return strategy;
        }
        return null;
    }

    const openApiPath =
        mode === 'openapi' || mode === 'auto' ? await findOpenApiSpec(project) : null;

    if (openApiPath) {
        const strategy = new OpenApiStrategy(openApiPath, logger);
        if (await strategy.validate(options)) {
            if (mode === 'auto' && (await hasJavaSources(project))) {
                logger.warn(
                    `Using OpenAPI spec found at ${openApiPath} — Java sources are NOT parsed. ` +
                        'If this spec is stale, pass --strategy parser to generate from source.',
                );
            }
            return strategy;
        }
    }

    if (mode === 'openapi') {
        return null;
    }

    logger.debug('OpenAPI not found, trying parser strategy...');
    const parserStrategy = new ParserStrategy(project, logger);
    if (await parserStrategy.validate(options)) {
        logger.debug('Found Spring Boot controllers');
        return parserStrategy;
    }

    return null;
}

async function hasJavaSources(project) {
    if (!(await pathExists(project)) || !(await isDirectory(project))) {
        return false;
    }
    const { glob } = require('glob');
    const matches = await glob('**/src/main/java/**/*.java', {
        cwd: project,
        nodir: true,
        ignore: ['**/node_modules/**', '**/target/**', '**/build/**'],
        windowsPathsNoEscape: true,
    });
    return matches.length > 0;
}

/**
 * URLs must never go through path.resolve — that is what broke `--project
 * http://host/v3/api-docs` in v1.
 */
function resolveProjectPath(project) {
    if (isUrl(project)) {
        return project;
    }
    return resolvePath(project);
}

module.exports = {
    detectStrategy,
    resolveProjectPath,
};
