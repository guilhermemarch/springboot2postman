# SpringBoot2Postman

Generate Postman collections automatically from any Spring Boot project — with or without OpenAPI/Swagger.

[![npm weekly downloads](https://img.shields.io/npm/dw/springboot2postman?style=for-the-badge)](https://www.npmjs.com/package/springboot2postman)



## Features

- **Dual Strategy Support**: Works with OpenAPI specs (JSON/YAML) or directly parses Java source code
- **Static Analysis**: No compilation required — parses `@RestController` annotations directly
- **Spring Boot Aware**: Understands `@GetMapping`, `@PostMapping`, `@RequestParam`, `@PathVariable`, etc.
- **Type Resolution**: Automatically converts Java types to JSON Schema
- **Flexible Input**: Accepts project paths, file paths, or OpenAPI URLs
- **Large Codebase Support**: Parallel processing with configurable concurrency
- **Package Filtering**: Include/exclude patterns for targeting specific packages

## Installation

```bash
npm install -g springboot2postman
```

Or use directly with npx:

```bash
npx springboot2postman --project ./my-spring-app
```

## Quick Start

```bash
# From a Spring Boot project directory
springboot2postman --project . --out api.postman_collection.json

# From an OpenAPI URL
springboot2postman --project https://api.example.com/v3/api-docs --out api.json

# With a custom base URL
springboot2postman --project ./my-app --base-url https://staging.example.com

# Large project with filtering
springboot2postman --project ./large-app --include "com.example.api.*" --exclude "*Test*" --concurrency 10
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--project <path>` | Project path or OpenAPI URL (required) | — |
| `--out <file>` | Output file path | `./postman_collection.json` |
| `--base-url <url>` | Override the base URL in the collection | — |
| `--format <format>` | Output format: `postman` or `openapi` | `postman` |
| `--include <patterns>` | Include only matching packages (comma-separated globs) | — |
| `--exclude <patterns>` | Exclude matching packages (comma-separated globs) | — |
| `--concurrency <n>` | Max parallel file parsing | `5` |
| `--verbose` | Enable verbose logging | `false` |

## How It Works

### Strategy Detection

The tool automatically detects the best approach:

1. **URL Input** → Fetches and converts OpenAPI spec
2. **OpenAPI File Found** → Uses OpenAPI strategy (looks for `openapi.json`, `swagger.yaml`, etc.)
3. **Java Controllers Found** → Uses Parser strategy (static analysis)

### Parser Strategy

When no OpenAPI spec is available, the tool:

1. Scans for files with `@RestController` or `@Controller` annotations
2. Applies include/exclude filters
3. Parses controllers in parallel (configurable concurrency)
4. Extracts endpoint mappings (`@GetMapping`, `@PostMapping`, etc.)
5. Resolves parameter annotations (`@PathVariable`, `@RequestParam`, `@RequestBody`)
6. Converts Java types to JSON Schema
7. Builds an OpenAPI specification
8. Converts to Postman collection format

### Supported Annotations

| Controller | Method | Parameter |
|------------|--------|-----------|
| `@RestController` | `@GetMapping` | `@PathVariable` |
| `@Controller` | `@PostMapping` | `@RequestParam` |
| `@RequestMapping` | `@PutMapping` | `@RequestBody` |
| | `@DeleteMapping` | `@RequestHeader` |
| | `@PatchMapping` | |

## Error Codes

| Code | Description |
|------|-------------|
| `PROJECT_NOT_FOUND` | The specified project path does not exist |
| `NO_CONTROLLERS_FOUND` | No Spring Boot controllers found in the project |
| `OPENAPI_FETCH_FAILED` | Failed to fetch OpenAPI specification from URL/file |
| `INVALID_OPENAPI` | The OpenAPI specification is invalid or unsupported |
| `PARSE_ERROR` | Failed to parse a Java file |
| `CONVERSION_FAILED` | Failed to convert to Postman collection |

## Requirements

- Node.js 16.0.0 or higher
- npm 7.0.0 or higher

