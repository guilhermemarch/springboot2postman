# SpringBoot2Postman

Generate Postman collections automatically from any Spring Boot project — with or without OpenAPI/Swagger.

[![npm weekly downloads](https://img.shields.io/npm/dw/springboot2postman?style=for-the-badge)](https://www.npmjs.com/package/springboot2postman)

## Features

- **Dual Strategy Support**: Works with OpenAPI specs (JSON/YAML) or parses Java source via CST (Concrete Syntax Tree)
- **Static Analysis**: No compilation required — parses `@RestController` annotations directly
- **Spring Boot Aware**: Understands `@GetMapping`, `@PostMapping`, `@RequestParam`, `@PathVariable`, `Pageable`, etc.
- **Type Resolution**: Converts Java types and DTOs to JSON Schema in the generated OpenAPI intermediate spec
- **Flexible Input**: Accepts project directories, OpenAPI file paths, or OpenAPI URLs
- **Project Config**: Reads `application.properties` / `application.yml` for context path, port, and app name
- **Large Codebase Support**: Parallel processing with configurable concurrency
- **Package Filtering**: Include/exclude glob patterns for file paths

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

# From an OpenAPI file path
springboot2postman --project ./docs/openapi.yaml --out api.json

# From an OpenAPI URL (springdoc)
springboot2postman --project http://localhost:8080/v3/api-docs --out api.json

# With a custom base URL
springboot2postman --project ./my-app --base-url https://staging.example.com

# Export OpenAPI instead of Postman
springboot2postman --project ./my-app --format openapi --out api-spec.json

# Deterministic mock data (useful for CI/snapshots)
springboot2postman --project ./my-app --seed 42

# Dry run (no files written)
springboot2postman generate --project ./my-app --dry-run

# Validate project for CI
springboot2postman validate --project ./my-app

# Export Postman environment file
springboot2postman generate --project ./my-app --env-out api.postman_environment.json

# Large project with filtering
springboot2postman --project ./large-app --include "com.example.api.*" --exclude "*Test*" --concurrency 10
```

## Import into Postman

1. Open Postman → **Import** → **File**
2. Select the generated `postman_collection.json`
3. Optionally import `postman_environment.json` from `--env-out`
4. Set collection variables `baseUrl` and `token` as needed

## CLI Commands

| Command    | Description                                             |
| ---------- | ------------------------------------------------------- |
| `generate` | Generate a Postman collection or OpenAPI spec (default) |
| `validate` | Check whether the project can be processed              |

## CLI Options (`generate`)

| Option                 | Description                                              | Default                                                  |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `--project <path>`     | Project path, OpenAPI file, or OpenAPI URL (required)    | —                                                        |
| `--out <file>`         | Output file path                                         | `./postman_collection.json`                              |
| `--env-out <file>`     | Postman environment output path                          | —                                                        |
| `--dry-run`            | Analyze without writing output files                     | `false`                                                  |
| `--base-url <url>`     | Override the base URL in the collection                  | from `application.properties` or `http://localhost:8080` |
| `--format <format>`    | Output format: `postman` or `openapi`                    | `postman`                                                |
| `--include <patterns>` | Include only matching file paths (comma-separated globs) | —                                                        |
| `--exclude <patterns>` | Exclude matching file paths (comma-separated globs)      | —                                                        |
| `--concurrency <n>`    | Max parallel file parsing                                | `5`                                                      |
| `--seed <n>`           | Seed for deterministic mock data                         | random                                                   |
| `--no-enhance`         | Skip Postman collection enhancements                     | `false`                                                  |
| `--verbose`            | Enable verbose logging                                   | `false`                                                  |

## How It Works

### Strategy Detection

The tool automatically detects the best approach:

1. **URL Input** → Fetches and converts OpenAPI spec
2. **OpenAPI File** → Direct file path to JSON/YAML spec
3. **OpenAPI in Project** → Searches root, `src/main/resources/`, `docs/`, etc.
4. **Java Controllers Found** → Parser strategy (CST-based static analysis)

### Parser Strategy

When no OpenAPI spec is available, the tool:

1. Reads `application.properties` / `application.yml` for base URL and collection name
2. Scans for DTOs and builds JSON Schema components
3. Scans for files with `@RestController` or `@Controller` annotations
4. Parses controllers using `java-parser` (CST)
5. Extracts endpoint mappings and parameters (including `Pageable`)
6. Builds an OpenAPI specification with populated schemas
7. Converts to Postman collection format
8. Enhances collection (variables, headers, saved responses)

### Supported Annotations

| Controller        | Method           | Parameter                                   |
| ----------------- | ---------------- | ------------------------------------------- |
| `@RestController` | `@GetMapping`    | `@PathVariable`                             |
| `@Controller`     | `@PostMapping`   | `@RequestParam`                             |
| `@RequestMapping` | `@PutMapping`    | `@RequestBody`                              |
|                   | `@DeleteMapping` | `@RequestHeader`                            |
|                   | `@PatchMapping`  | `@ModelAttribute`                           |
|                   |                  | `Pageable` (as page/size/sort query params) |

## Known Limitations

- **Java only** — Kotlin controllers are not supported
- **No Lombok expansion** — fields must be visible in source (private fields in DTOs are detected)
- **Single module** — scans one `--project` directory; multi-module monorepos need per-module runs
- **Regex-free but CST-limited** — complex annotation arrays (`value = {"/a", "/b"}`) are not expanded
- **No Spring Security extraction** — OAuth/API key config is not inferred from annotations
- **Include/exclude** — filters match file paths, not Java package names directly

## Development

```bash
git clone https://github.com/guilhermemarch/springboot2postman.git
cd springboot2postman
npm install
npm test
npm run lint
```

## Error Codes

| Code                   | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `PROJECT_NOT_FOUND`    | The specified project path does not exist           |
| `NO_CONTROLLERS_FOUND` | No Spring Boot controllers found in the project     |
| `OPENAPI_FETCH_FAILED` | Failed to fetch OpenAPI specification from URL/file |
| `INVALID_OPENAPI`      | The OpenAPI specification is invalid or unsupported |
| `PARSE_ERROR`          | Failed to parse a Java file                         |
| `CONVERSION_FAILED`    | Failed to convert to Postman collection             |

## Requirements

- Node.js 16.0.0 or higher
- npm 7.0.0 or higher
