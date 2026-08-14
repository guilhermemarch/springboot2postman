# springboot2postman

Generate Postman collections, OpenAPI specs and `.http` files **from Spring Boot source code** — no build, no running application, no changes to your `pom.xml`.

```bash
npx springboot2postman --project ./any-spring-repo-you-just-cloned
```

## Why this exists

Every other way of getting a Postman collection out of a Spring Boot service requires something you may not have:

| Approach                                    | Requires                                     |
| ------------------------------------------- | -------------------------------------------- |
| springdoc + Postman import                  | The app running (with the right profile)     |
| openapi-maven-plugin / restdocs-api-spec    | A working build + build file changes         |
| Writing the collection by hand              | Your afternoon                               |
| **springboot2postman**                      | **A checkout of the source code**            |

If your app already runs with springdoc, importing `http://localhost:8080/v3/api-docs` straight into Postman is great — use that. This tool is for when you can't or don't want to run the code: legacy services, unfamiliar repos, CI pipelines, codebases that take 20 minutes to boot.

## What you get

- **Static analysis of Java sources** (CST-based, not regex): `@RestController`, `@RequestMapping` with named attributes and constants, multiple paths, `produces`/`consumes`, `@ResponseStatus`, records, enums, controller inheritance (including generic base controllers like `CrudController<T, ID>`), API-first interfaces, Lombok-style DTOs, Jackson (`@JsonProperty`, `@JsonIgnore`), Bean Validation → schema constraints, Javadoc → descriptions, multipart uploads, `@ModelAttribute` expansion, `Pageable`, cookies and headers.
- **Multi-module projects**: all `src/main/java` roots are scanned; `src/test` never is.
- **Honest output**: if a type cannot be resolved, you get an empty schema **and a warning naming it** — never invented fields. The run ends with a resolution report; `--strict` turns it into a CI gate.
- **Deterministic**: same input + same seed = byte-identical output. Diff-friendly by default.
- **Three formats**: Postman collection v2.1, OpenAPI 3.0.3, and `.http` (IntelliJ HTTP Client / VS Code REST Client).
- **Drift detection**: `springboot2postman diff` fails CI when the code no longer matches your committed collection or spec.

## Install

```bash
npm install -g springboot2postman   # or use npx
```

Requires Node.js 18+.

## Usage

```bash
# Postman collection from source (most common)
springboot2postman --project ./my-spring-app --out api.postman_collection.json

# OpenAPI 3 spec instead
springboot2postman --project ./my-spring-app --format openapi --out openapi.json

# .http file for IntelliJ / VS Code REST Client
springboot2postman --project ./my-spring-app --format http --out api.http

# From an OpenAPI URL (springdoc) — including behind auth
springboot2postman --project http://localhost:8080/v3/api-docs --bearer $TOKEN

# Pipe to stdout
springboot2postman --project . --out - | jq '.info'

# Postman environment alongside the collection
springboot2postman --project . --env-out api.postman_environment.json

# CI: fail when anything could not be resolved
springboot2postman --project . --strict --quiet

# CI: fail when the API drifted from the committed spec
springboot2postman diff --project . --against docs/openapi.json

# Force parsing the source even when a (possibly stale) spec file exists
springboot2postman --project . --strategy parser
```

## Commands

| Command    | Description                                                        |
| ---------- | ------------------------------------------------------------------ |
| `generate` | Generate a collection / spec / .http file (default command)        |
| `validate` | Check whether the project can be processed (exit code for CI)      |
| `diff`     | Compare generated API against an existing collection or spec       |

## Options (`generate`)

| Option                 | Description                                                    | Default                       |
| ---------------------- | -------------------------------------------------------------- | ----------------------------- |
| `--project <path>`     | Project path, OpenAPI file, or OpenAPI URL (required)          | —                             |
| `--out <file>`         | Output file, or `-` for stdout                                 | `./postman_collection.json`   |
| `--format <format>`    | `postman`, `openapi` or `http`                                 | `postman`                     |
| `--env-out <file>`     | Also write a Postman environment file                          | —                             |
| `--base-url <url>`     | Override the base URL                                          | from `application.properties` |
| `--strategy <mode>`    | `auto`, `parser` (force source) or `openapi` (force spec)      | `auto`                        |
| `--header <h>`         | Header for protected spec URLs (repeatable)                    | —                             |
| `--bearer <token>`     | Bearer token for protected spec URLs                           | —                             |
| `--include <globs>`    | Only scan matching file paths (comma-separated)                | —                             |
| `--exclude <globs>`    | Skip matching file paths (comma-separated)                     | —                             |
| `--seed <n>`           | Seed for deterministic example data                            | `1`                           |
| `--strict`             | Exit 2 when any file/type could not be resolved                | off                           |
| `--quiet`              | Errors only (CI/piping)                                        | off                           |
| `--dry-run`            | Analyze without writing files                                  | off                           |
| `--no-enhance`         | Skip Postman post-processing                                   | off                           |
| `--concurrency <n>`    | Parallel file parsing                                          | `5`                           |

Options can also live in a `springboot2postman.config.json` in the working directory; CLI flags win.

## The resolution report

Every run tells you exactly what it could and could not do:

```
ok  Collection generated successfully!
i   Endpoints: 14
i   Schemas: 7
warn Unresolved type: LegacyBlob (type not found) — used at ArchiveController.download
```

Unknown types become `{}` in the schema — never plausible-looking invented fields. `--strict` makes any warning fail the build.

## What is NOT supported (yet)

Read this before trusting the output:

- **Kotlin controllers** — Java only for now.
- **Endpoints registered programmatically** (`RouterFunction`, functional endpoints).
- **Constants resolved through method calls or complex expressions** in mapping paths (simple constants, cross-file constants and string concatenation work).
- **Spring Security inference** — auth is derived from OpenAPI `securitySchemes` when present, but not guessed from `SecurityFilterChain` code.
- **Error response bodies** — 4xx statuses found in the code are listed, but their payload shape is not inferred from `@ControllerAdvice`.
- **Type variables that never get bound** (raw `T` in an unused abstract base) resolve to empty objects and are reported.

## Development

```bash
git clone https://github.com/guilhermemarch/springboot2postman.git
cd springboot2postman
npm install
npm test
npm run lint
```

The test corpus in `tests/fixtures/shop-api` is a realistic multi-module project (records, Lombok, inheritance, API-first interfaces, multipart, enums) — every parser bug fixed in v2 has a regression test against it.

## Error codes

| Code                   | Meaning                                              |
| ---------------------- | ---------------------------------------------------- |
| `PROJECT_NOT_FOUND`    | The specified project path does not exist            |
| `NO_CONTROLLERS_FOUND` | No Spring controllers found (or filters exclude all) |
| `OPENAPI_FETCH_FAILED` | Could not fetch the spec (cause is printed)          |
| `INVALID_OPENAPI`      | The spec is invalid or unsupported                   |
| `PARSE_ERROR`          | A Java file could not be parsed (file is skipped)    |
| `CONVERSION_FAILED`    | OpenAPI → Postman conversion failed                  |

## License

MIT
