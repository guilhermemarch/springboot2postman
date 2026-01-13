# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- JSDoc documentation for all modules
