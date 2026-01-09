const Logger = require('../../lib/logger');
const { writeFile } = require('../../lib/file-utils');
const OpenApiStrategy = require('../../core/strategies/openapi-strategy');
const { isUrl } = require('../../lib/file-utils');

async function generate(options) {
    const logger = new Logger(options.verbose);

    try {
        logger.startSpinner('Analyzing project...');

        const strategy = await detectStrategy(options.project, logger);

        if (!strategy) {
            logger.failSpinner('Failed to detect project type');
            logger.error('Could not find OpenAPI specification or Spring Boot controllers');
            logger.info('Make sure your project has:');
            logger.info('  - OpenAPI/Swagger specification (JSON/YAML), OR');
            logger.info('  - Spring Boot controllers with @RestController annotation');
            process.exit(1);
        }

        logger.debug(`Using strategy: ${strategy.getName()}`);

        const collection = await strategy.extract({
            baseUrl: options.baseUrl,
            format: options.format,
            include: options.include,
            exclude: options.exclude,
            concurrency: options.concurrency,
        });

        logger.updateSpinner('Writing output file...');
        const output = JSON.stringify(collection, null, 2);
        await writeFile(options.out, output);

        logger.succeedSpinner(`Collection generated successfully!`);
        logger.success(`Output: ${options.out}`);
        logger.info(`Collection: ${collection.info.name}`);
        logger.info(`Endpoints: ${countEndpoints(collection)} total`);

    } catch (error) {
        logger.failSpinner('Generation failed');
        logger.error(error.message);

        if (options.verbose && error.stack) {
            console.error(`\n${error.stack}`);
        }

        if (error.code) {
            logger.info(`Error code: ${error.code}`);
        }

        process.exit(1);
    }
}

async function detectStrategy(project, logger) {
    logger.debug('Detecting strategy...');

    if (isUrl(project)) {
        logger.debug('Input is URL, trying OpenAPI strategy...');
        const strategy = new OpenApiStrategy(project, logger);
        if (await strategy.validate()) {
            return strategy;
        }
    }

    const openApiFiles = [
        'openapi.json',
        'openapi.yaml',
        'openapi.yml',
        'swagger.json',
        'swagger.yaml',
        'swagger.yml',
    ];

    for (const filename of openApiFiles) {
        const filepath = `${project}/${filename}`;
        logger.debug(`Checking for ${filepath}...`);

        const strategy = new OpenApiStrategy(filepath, logger);
        if (await strategy.validate()) {
            logger.debug(`Found: ${filepath}`);
            return strategy;
        }
    }

    logger.debug('OpenAPI not found, trying parser strategy...');
    const ParserStrategy = require('../../core/strategies/parser-strategy');
    const parserStrategy = new ParserStrategy(project, logger);

    if (await parserStrategy.validate()) {
        logger.debug('Found Spring Boot controllers');
        return parserStrategy;
    }

    return null;
}

function countEndpoints(collection) {
    let count = 0;

    function countInFolder(items) {
        for (const item of items) {
            if (item.item) {
                countInFolder(item.item);
            } else if (item.request) {
                count++;
            }
        }
    }

    if (collection.item) {
        countInFolder(collection.item);
    }

    return count;
}

module.exports = generate;
