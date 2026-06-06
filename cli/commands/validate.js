const Logger = require('../../lib/logger');
const { detectStrategy, resolveProjectPath } = require('../../lib/strategy-detector');

async function validate(options) {
    const logger = new Logger(options.verbose);
    const projectPath = resolveProjectPath(options.project);

    try {
        logger.startSpinner('Validating project...');

        const strategy = await detectStrategy(projectPath, logger, { verbose: options.verbose });

        if (!strategy) {
            logger.failSpinner('Validation failed');
            logger.error('Could not find OpenAPI specification or Spring Boot controllers');
            process.exit(1);
        }

        logger.succeedSpinner('Project is valid');
        logger.success(`Strategy: ${strategy.getName()}`);
        logger.info(`Project: ${projectPath}`);
        process.exit(0);
    } catch (error) {
        logger.failSpinner('Validation failed');
        logger.error(error.message);

        if (options.verbose && error.stack) {
            console.error(`\n${error.stack}`);
        }

        process.exit(1);
    }
}

module.exports = validate;
