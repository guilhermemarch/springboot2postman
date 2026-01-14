# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
