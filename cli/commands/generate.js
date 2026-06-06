const Logger = require('../../lib/logger');
const { writeFile } = require('../../lib/file-utils');
const { detectStrategy, resolveProjectPath } = require('../../lib/strategy-detector');
const { countResultEndpoints, getResultTitle } = require('../../lib/endpoint-counter');
const { buildEnvironment } = require('../../core/postman/environment-builder');
const { loadProjectConfig } = require('../../core/config/project-config');

async function generate(options) {
    const logger = new Logger(options.verbose);
    const projectPath = resolveProjectPath(options.project);

    try {
        logger.startSpinner('Analyzing project...');

        const strategy = await detectStrategy(projectPath, logger, { verbose: options.verbose });

        if (!strategy) {
            logger.failSpinner('Failed to detect project type');
            logger.error('Could not find OpenAPI specification or Spring Boot controllers');
            logger.info('Make sure your project has:');
            logger.info('  - OpenAPI/Swagger specification (JSON/YAML), OR');
            logger.info('  - Spring Boot controllers with @RestController annotation');
            process.exit(1);
        }

        logger.debug(`Using strategy: ${strategy.getName()}`);

        const result = await strategy.extract({
            projectPath,
            baseUrl: options.baseUrl,
            format: options.format,
            include: options.include,
            exclude: options.exclude,
            concurrency: options.concurrency,
            seed: options.seed,
            enhance: options.enhance !== false,
        });

        const endpointCount = countResultEndpoints(result, options.format);
        const title = getResultTitle(result, options.format);
        const isOpenApiOutput =
            options.format === 'openapi' || Boolean(result.openapi && result.paths);

        if (options.dryRun) {
            logger.succeedSpinner('Dry run complete');
            logger.info(`Strategy: ${strategy.getName()}`);
            logger.info(`Title: ${title}`);
            logger.info(`Endpoints: ${endpointCount} total`);
            logger.info('No files written (--dry-run)');
            return;
        }

        logger.updateSpinner('Writing output file...');
        const output = JSON.stringify(result, null, 2);
        await writeFile(options.out, output);

        if (options.envOut) {
            const projectConfig = await loadProjectConfig(projectPath);
            const baseUrl =
                options.baseUrl ||
                result.variable?.find((v) => v.key === 'baseUrl')?.value ||
                projectConfig.baseUrl;

            const environment = buildEnvironment({
                name: `${title} Environment`,
                baseUrl,
            });

            await writeFile(options.envOut, JSON.stringify(environment, null, 2));
            logger.info(`Environment: ${options.envOut}`);
        }

        logger.succeedSpinner(
            isOpenApiOutput
                ? 'OpenAPI spec generated successfully!'
                : 'Collection generated successfully!',
        );
        logger.success(`Output: ${options.out}`);

        if (isOpenApiOutput) {
            logger.info(`Spec: ${title}`);
        } else {
            logger.info(`Collection: ${title}`);
        }
        logger.info(`Endpoints: ${endpointCount} total`);
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

module.exports = generate;
