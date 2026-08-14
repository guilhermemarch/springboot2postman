const Logger = require('../../lib/logger');
const { writeFile } = require('../../lib/file-utils');
const { detectStrategy, resolveProjectPath } = require('../../lib/strategy-detector');
const { loadConfigFile } = require('../../lib/config-file');
const { buildEnvironment } = require('../../core/postman/environment-builder');

const OUTPUT_EXTENSIONS = {
    postman: 'postman_collection.json',
    openapi: 'openapi.json',
    http: 'api.http',
};

async function generate(cliOptions, command) {
    let options = cliOptions;
    let logger = new Logger(options.verbose, options.quiet);

    try {
        // Commander fills defaults, so distinguish explicitly-passed flags:
        // CLI > config file > defaults.
        const explicit = {};
        for (const key of Object.keys(cliOptions)) {
            const source = command?.getOptionValueSource?.(key);
            if (source === undefined || source === 'cli' || source === 'env') {
                explicit[key] = cliOptions[key];
            }
        }
        const fileConfig = await loadConfigFile();
        const { __source, ...fileValues } = fileConfig;
        if (__source) {
            logger.debug(`Loaded config from ${__source}`);
        }
        options = { ...cliOptions, ...fileValues, ...explicit };
        logger = new Logger(options.verbose, options.quiet);

        const format = options.format || 'postman';
        if (!OUTPUT_EXTENSIONS[format]) {
            logger.error(`Unknown format "${format}". Use: postman, openapi or http`);
            process.exit(1);
        }

        // When --out was not given, name the file after the format.
        const outWasDefaulted =
            command?.getOptionValueSource?.('out') === 'default' && fileValues.out === undefined;
        if (outWasDefaulted) {
            options.out = `./${OUTPUT_EXTENSIONS[format]}`;
        }

        const projectPath = resolveProjectPath(options.project);

        logger.startSpinner('Analyzing project...');

        const strategy = await detectStrategy(projectPath, logger, {
            verbose: options.verbose,
            strategy: options.strategy,
            headers: options.header,
            bearer: options.bearer,
        });

        if (!strategy) {
            logger.failSpinner('Failed to detect project type');
            logger.error('Could not find OpenAPI specification or Spring Boot controllers');
            logger.info('Make sure your project has one of:');
            logger.info('  - Spring Boot controllers annotated with @RestController');
            logger.info('  - An OpenAPI/Swagger specification (JSON/YAML)');
            logger.info('  - A reachable OpenAPI URL (e.g. http://localhost:8080/v3/api-docs)');
            process.exit(1);
        }

        logger.debug(`Using strategy: ${strategy.getName()}`);

        const { output, spec, report } = await strategy.extract({
            projectPath,
            baseUrl: options.baseUrl,
            format,
            include: options.include,
            exclude: options.exclude,
            concurrency: options.concurrency,
            seed: options.seed,
            enhance: options.enhance !== false,
            headers: options.header,
            bearer: options.bearer,
        });

        const serialized =
            typeof output === 'string' ? output : `${JSON.stringify(output, null, 2)}\n`;

        if (options.dryRun) {
            logger.succeedSpinner('Dry run complete');
            printReport(logger, report, { strategy });
            logger.info('No files written (--dry-run)');
        } else if (options.out === '-') {
            logger.stopSpinner();
            process.stdout.write(serialized);
        } else {
            logger.updateSpinner('Writing output file...');
            const outPath = options.out || `./${OUTPUT_EXTENSIONS[format]}`;
            await writeFile(outPath, serialized);

            if (options.envOut && format === 'postman') {
                const environment = buildEnvironment({
                    name: `${output.info?.name || 'API'} Environment`,
                    collection: output,
                    baseUrl: options.baseUrl,
                });
                await writeFile(options.envOut, `${JSON.stringify(environment, null, 2)}\n`);
            }

            logger.succeedSpinner(
                format === 'postman'
                    ? 'Collection generated successfully!'
                    : format === 'openapi'
                      ? 'OpenAPI spec generated successfully!'
                      : 'HTTP file generated successfully!',
            );
            logger.success(`Output: ${outPath}`);
            if (options.envOut && format === 'postman') {
                logger.info(`Environment: ${options.envOut}`);
            }

            const title = spec?.info?.title || output.info?.name;
            if (title) {
                logger.info(`API: ${title}`);
            }
            printReport(logger, report, { strategy });
        }

        if (options.strict && report.hasIssues()) {
            logger.error(
                `Strict mode: ${report.issueCount()} unresolved issue(s) — failing (exit 2)`,
            );
            process.exit(2);
        }
    } catch (error) {
        logger.failSpinner('Generation failed');
        logger.error(error.message);

        if (error.details?.originalError && error.details.originalError !== error.message) {
            logger.error(`Cause: ${error.details.originalError}`);
        }

        if (options.verbose && error.stack) {
            console.error(`\n${error.stack}`);
        }

        if (error.code) {
            logger.info(`Error code: ${error.code}`);
        }

        process.exit(1);
    }
}

function printReport(logger, report, { strategy }) {
    if (!report) {
        return;
    }

    logger.info(`Strategy: ${strategy.getName()}`);

    for (const line of report.toLines()) {
        if (line.level === 'warn') {
            logger.warn(line.text);
        } else {
            logger.info(line.text);
        }
    }

    if (report.hasIssues()) {
        logger.info(
            'Some items could not be fully resolved; ' +
                'the affected schemas were left empty instead of guessed.',
        );
    }
}

module.exports = generate;
