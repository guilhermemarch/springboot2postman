const Logger = require('../../lib/logger');
const { detectStrategy, resolveProjectPath } = require('../../lib/strategy-detector');
const { readFile } = require('../../lib/file-utils');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/**
 * Compare what the project generates now against an existing collection or
 * OpenAPI spec. Exits 1 when the contract drifted — made for CI.
 */
async function diff(options) {
    const logger = new Logger(options.verbose, options.quiet);

    try {
        const projectPath = resolveProjectPath(options.project);

        logger.startSpinner('Generating current API state...');
        const strategy = await detectStrategy(projectPath, logger, {
            verbose: options.verbose,
            strategy: options.strategy,
            headers: options.header,
            bearer: options.bearer,
        });

        if (!strategy) {
            logger.failSpinner('Failed to detect project type');
            logger.error('Could not find OpenAPI specification or Spring Boot controllers');
            process.exit(1);
        }

        const { spec } = await strategy.extract({
            format: 'openapi',
            seed: 1,
            headers: options.header,
            bearer: options.bearer,
        });
        const current = signaturesFromOpenApi(spec);

        logger.updateSpinner(`Reading ${options.against}...`);
        const targetRaw = JSON.parse(await readFile(options.against));
        const target = extractTargetSignatures(targetRaw);

        logger.stopSpinner();

        const result = compareSignatures(current, target.signatures, target.kind);
        printDiff(logger, result, options.against);

        const failOn = options.failOn || 'any';
        const hasBreaking = result.removed.length > 0 || result.changed.some((c) => c.breaking);
        const hasAny =
            result.added.length > 0 || result.removed.length > 0 || result.changed.length > 0;

        if ((failOn === 'any' && hasAny) || (failOn === 'breaking' && hasBreaking)) {
            process.exit(1);
        }
        process.exit(0);
    } catch (error) {
        logger.failSpinner('Diff failed');
        logger.error(error.message);
        if (options.verbose && error.stack) {
            console.error(`\n${error.stack}`);
        }
        process.exit(2);
    }
}

function extractTargetSignatures(document) {
    if (document && document.paths && (document.openapi || document.swagger)) {
        return { kind: 'openapi', signatures: signaturesFromOpenApi(document) };
    }
    if (document && document.info && Array.isArray(document.item)) {
        return { kind: 'postman', signatures: signaturesFromCollection(document) };
    }
    throw new Error('--against file is neither an OpenAPI spec nor a Postman collection');
}

function normalizePath(path) {
    let normalized = String(path || '/');
    if (!normalized.startsWith('/')) {
        normalized = `/${normalized}`;
    }
    normalized = normalized.replace(/\/{2,}/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    // Postman-style :var -> {var}
    normalized = normalized.replace(/:(\w+)/g, '{$1}');
    return normalized;
}

function signaturesFromOpenApi(spec) {
    const signatures = new Map();

    for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
        for (const method of HTTP_METHODS) {
            const operation = pathItem[method];
            if (!operation) {
                continue;
            }
            const key = `${method.toUpperCase()} ${normalizePath(pathKey)}`;
            const query = new Set(
                (operation.parameters || [])
                    .filter((p) => p.in === 'query')
                    .map((p) => p.name),
            );
            const requiredQuery = new Set(
                (operation.parameters || [])
                    .filter((p) => p.in === 'query' && p.required)
                    .map((p) => p.name),
            );
            signatures.set(key, {
                query,
                requiredQuery,
                hasBody: Boolean(operation.requestBody),
                statuses: new Set(Object.keys(operation.responses || {})),
            });
        }
    }

    return signatures;
}

function signaturesFromCollection(collection) {
    const signatures = new Map();

    const visit = (items) => {
        for (const item of items || []) {
            if (item.item) {
                visit(item.item);
                continue;
            }
            const request = item.request;
            if (!request || !request.method) {
                continue;
            }

            const { path, query } = parsePostmanUrl(request.url);
            const key = `${request.method.toUpperCase()} ${normalizePath(path)}`;

            const hasBody =
                Boolean(request.body) &&
                request.body.mode !== undefined &&
                request.body.mode !== 'none';

            signatures.set(key, {
                query: new Set(query),
                requiredQuery: new Set(),
                hasBody,
                statuses: null,
            });
        }
    };

    visit(collection.item);
    return signatures;
}

function parsePostmanUrl(url) {
    if (!url) {
        return { path: '/', query: [] };
    }

    if (typeof url === 'string') {
        const withoutBase = url.replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/^\{\{[^}]+\}\}/, '');
        const [pathPart, queryPart] = withoutBase.split('?');
        const query = queryPart
            ? queryPart
                  .split('&')
                  .map((pair) => pair.split('=')[0])
                  .filter(Boolean)
            : [];
        return { path: pathPart || '/', query };
    }

    const segments = (url.path || []).filter(
        (segment) => segment !== '' && segment !== '{{baseUrl}}',
    );
    const query = (url.query || []).map((q) => q.key).filter(Boolean);
    return { path: `/${segments.join('/')}`, query };
}

function compareSignatures(current, target, targetKind) {
    const added = [];
    const removed = [];
    const changed = [];

    for (const key of current.keys()) {
        if (!target.has(key)) {
            added.push(key);
        }
    }
    for (const key of target.keys()) {
        if (!current.has(key)) {
            removed.push(key);
        }
    }

    for (const [key, cur] of current) {
        const tgt = target.get(key);
        if (!tgt) {
            continue;
        }

        const details = [];
        let breaking = false;

        for (const param of cur.query) {
            if (!tgt.query.has(param)) {
                const isRequired = cur.requiredQuery.has(param);
                details.push(`query param added: ${param}${isRequired ? ' (required)' : ''}`);
                if (isRequired) {
                    breaking = true;
                }
            }
        }
        for (const param of tgt.query) {
            if (!cur.query.has(param)) {
                details.push(`query param removed: ${param}`);
                breaking = true;
            }
        }

        if (cur.hasBody !== tgt.hasBody) {
            details.push(cur.hasBody ? 'request body added' : 'request body removed');
            breaking = true;
        }

        if (targetKind === 'openapi' && cur.statuses && tgt.statuses) {
            for (const status of cur.statuses) {
                if (!tgt.statuses.has(status)) {
                    details.push(`response added: ${status}`);
                }
            }
            for (const status of tgt.statuses) {
                if (!cur.statuses.has(status)) {
                    details.push(`response removed: ${status}`);
                }
            }
        }

        if (details.length > 0) {
            changed.push({ key, details, breaking });
        }
    }

    return {
        added: added.sort(),
        removed: removed.sort(),
        changed: changed.sort((a, b) => a.key.localeCompare(b.key)),
    };
}

function printDiff(logger, result, againstFile) {
    const total = result.added.length + result.removed.length + result.changed.length;

    if (total === 0) {
        logger.success(`No API drift against ${againstFile}`);
        return;
    }

    logger.warn(`API drift detected against ${againstFile}:`);

    for (const key of result.added) {
        logger.info(`  + ${key} (new endpoint, missing from target)`);
    }
    for (const key of result.removed) {
        logger.info(`  - ${key} (present in target, no longer generated)`);
    }
    for (const change of result.changed) {
        logger.info(`  ~ ${change.key}${change.breaking ? ' [breaking]' : ''}`);
        for (const detail of change.details) {
            logger.info(`      ${detail}`);
        }
    }
}

module.exports = diff;
