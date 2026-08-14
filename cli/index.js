#!/usr/bin/env node

const { Command } = require('commander');
const generate = require('./commands/generate');
const validate = require('./commands/validate');
const diff = require('./commands/diff');
const packageJson = require('../package.json');

const program = new Command();

program
    .name('springboot2postman')
    .description(
        'Generate Postman collections, OpenAPI specs or .http files from Spring Boot ' +
            'source code — no build, no running app required',
    )
    .version(packageJson.version);

function collectHeader(value, previous) {
    return [...(previous || []), value];
}

function addSharedOptions(command) {
    return command
        .requiredOption('--project <path>', 'Project path, OpenAPI file, or OpenAPI URL')
        .option('--strategy <mode>', 'Extraction strategy: auto, parser or openapi', 'auto')
        .option(
            '--header <header>',
            'HTTP header for fetching protected OpenAPI URLs (repeatable, "Name: value")',
            collectHeader,
        )
        .option('--bearer <token>', 'Bearer token for fetching protected OpenAPI URLs')
        .option('--quiet', 'Only print errors (CI-friendly)', false)
        .option('--verbose', 'Verbose output', false);
}

addSharedOptions(program.command('generate', { isDefault: true }))
    .description('Generate a Postman collection, OpenAPI spec or .http file')
    .option('--out <file>', 'Output file path, or "-" for stdout', './postman_collection.json')
    .option('--env-out <file>', 'Also write a Postman environment file')
    .option('--base-url <url>', 'Base URL override')
    .option('--format <format>', 'Output format: postman, openapi or http', 'postman')
    .option(
        '--include <patterns>',
        'Include only matching file paths (comma-separated glob patterns)',
    )
    .option('--exclude <patterns>', 'Exclude matching file paths (comma-separated glob patterns)')
    .option('--concurrency <n>', 'Max parallel file parsing', '5')
    .option('--seed <n>', 'Seed for deterministic example data (default: 1)')
    .option('--dry-run', 'Analyze project without writing output files', false)
    .option('--strict', 'Exit with code 2 when any type/file could not be resolved', false)
    .option('--no-enhance', 'Skip Postman collection post-processing')
    .action(generate);

addSharedOptions(program.command('validate'))
    .description('Check whether the project can be processed (CI-friendly)')
    .action(validate);

addSharedOptions(program.command('diff'))
    .description('Compare the generated API against an existing collection or OpenAPI spec')
    .requiredOption('--against <file>', 'Postman collection or OpenAPI spec to compare with')
    .option('--fail-on <level>', 'Exit 1 on: any (default) or breaking changes', 'any')
    .action(diff);

program.parse();
