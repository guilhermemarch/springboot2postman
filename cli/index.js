#!/usr/bin/env node

const { Command } = require('commander');
const generate = require('./commands/generate');
const validate = require('./commands/validate');
const packageJson = require('../package.json');

const program = new Command();

program
    .name('springboot2postman')
    .description('Generate Postman collections automatically from Spring Boot projects')
    .version(packageJson.version);

function addSharedOptions(command) {
    return command
        .requiredOption('--project <path>', 'Project path, OpenAPI file, or OpenAPI URL')
        .option('--verbose', 'Verbose output', false);
}

addSharedOptions(program.command('generate', { isDefault: true }))
    .description('Generate a Postman collection or OpenAPI spec')
    .option('--out <file>', 'Output file path', './postman_collection.json')
    .option('--env-out <file>', 'Output Postman environment file path')
    .option('--base-url <url>', 'Base URL override')
    .option('--format <format>', 'Output format (postman|openapi)', 'postman')
    .option(
        '--include <patterns>',
        'Include only matching file paths (comma-separated glob patterns)',
    )
    .option('--exclude <patterns>', 'Exclude matching file paths (comma-separated glob patterns)')
    .option('--concurrency <n>', 'Max parallel file parsing', '5')
    .option('--seed <n>', 'Seed for deterministic mock data generation')
    .option('--dry-run', 'Analyze project without writing output files', false)
    .option('--no-enhance', 'Skip Postman collection enhancements')
    .action(generate);

addSharedOptions(program.command('validate'))
    .description('Validate that a project can be processed')
    .action(validate);

program.parse();
