# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-06-06

### Added

- `validate` CLI subcommand for CI checks
- `--dry-run` flag to analyze projects without writing files
- `--env-out` to generate a Postman environment file
- Snapshot and CLI integration tests
- Coverage reporting in CI

### Fixed

- `@RequestMapping` without explicit `method` now expands to GET, POST, PUT, PATCH, DELETE
- `getDto()` prefers exact and suffix matches instead of fragile prefix matching
- `extractEntityName()` handles nested generics more reliably

### Changed

- CLI uses subcommands (`generate` default, `validate`)
- Strategy `validate()` logs failures when `--verbose` is enabled

### Removed

- Dead code: `producesJson`, `consumesJson`, `TypeResolver.generateExample`
- Legacy fixture at `tests/controller/UserController.java`

## [1.2.0] - 2026-06-06

### Added

- CST-based Java parsing via `java-parser` (replaces regex parser)
- `--format openapi` output for intermediate OpenAPI spec
- `--seed` for deterministic mock data generation
- `--no-enhance` flag to skip Postman collection enhancements
- OpenAPI file path support for `--project`
- Expanded OpenAPI discovery in `src/main/resources/`, `docs/`, etc.
- `application.properties` / `application.yml` reading for context path, port, and app name
- `Pageable` parameter support (page, size, sort query params)
- PostmanEnhancer applied to OpenAPI strategy path as well
- Test suite with fixtures, unit tests, and integration tests
- CI workflow, ESLint, Prettier, LICENSE, and `.gitignore`

### Fixed

- OpenAPI `$ref` schemas now populated from DTO scanner
- Controller scanner glob fallback when `*Controller.java` helpers exist
- Path variable double-templating in PostmanEnhancer
- CLI options no longer leak into `openapi-to-postmanv2` converter

### Changed

- Collection title uses `spring.application.name` when available
- Base URL defaults from project config when `--base-url` is omitted

## [1.1.0] - 2026-01-13

### Added

- **MockDataGenerator** - Realistic fake data using @faker-js/faker with field-name-aware generation
- **DtoScanner** - Automatic DTO class discovery and field extraction
- **PostmanEnhancer** - Post-processing for production-ready collections
- **Path variables as Postman variables** - Converts `{id}` to `{{userId}}` format
- **Collection-level variables** - `baseUrl`, `token` added by default
- **Multiple response examples** - 200, 201, 204, 400, 404 per endpoint type
- **Standard error responses** - Includes timestamp, status, error, message, path
- **Default headers** - Accept, Content-Type, Authorization (Bearer {{token}})
- **Improved request naming** - Clean names without HTTP method prefix

### Changed

- Request body examples now contain realistic mock data based on field names
- Response examples include realistic data (names, emails, dates)

## [1.0.0] - 2026-01-08

### Added

- Initial release
- Dual strategy support: OpenAPI and Parser strategies
- Static analysis of Spring Boot controllers (no compilation required)
- Support for `@RestController`, `@Controller`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`
- Parameter extraction: `@PathVariable`, `@RequestParam`, `@RequestBody`, `@RequestHeader`
- Java to JSON Schema type conversion
- `--include` and `--exclude` glob patterns for package filtering
- `--concurrency` option for parallel controller parsing
- Progress reporting during large codebase processing
- Comprehensive error handling with error codes
