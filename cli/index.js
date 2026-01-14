#!/usr/bin/env node

const { Command } = require('commander');
const generate = require('./commands/generate');
const packageJson = require('../package.json');

const program = new Command();

program
    .name('springboot2postman')
    .description('Generate Postman collections automatically from Spring Boot projects')
    .version(packageJson.version);

program
    .requiredOption('--project <path>', 'Project path or OpenAPI URL')
    .option('--out <file>', 'Output file path', './postman_collection.json')
    .option('--base-url <url>', 'Base URL override')
    .option('--format <format>', 'Output format (postman|openapi)', 'postman')
    .option('--include <patterns>', 'Include only matching packages (comma-separated glob patterns)')
    .option('--exclude <patterns>', 'Exclude matching packages (comma-separated glob patterns)')
    .option('--concurrency <n>', 'Max parallel file parsing', '5')
    .option('--verbose', 'Verbose output', false)
    .action(generate);

program.parse();
