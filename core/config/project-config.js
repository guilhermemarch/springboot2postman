const path = require('path');
const yaml = require('js-yaml');
const { glob } = require('glob');
const { readFile, pathExists, isFile, isDirectory } = require('../../lib/file-utils');

/**
 * Ordered by Spring Boot precedence: application.properties wins over
 * application.yml. Values are only filled when not already set by a
 * higher-precedence file.
 */
const CONFIG_LOCATIONS = [
    'src/main/resources/application.properties',
    'src/main/resources/application.yml',
    'src/main/resources/application.yaml',
    'application.properties',
    'application.yml',
    'application.yaml',
];

async function loadProjectConfig(projectPath) {
    const config = {
        appName: null,
        contextPath: null,
        port: null,
        baseUrl: null,
    };

    const files = await findConfigFiles(projectPath);

    for (const filepath of files) {
        if (config.appName !== null && config.contextPath !== null && config.port !== null) {
            break;
        }

        try {
            const content = await readFile(filepath);
            const ext = path.extname(filepath).toLowerCase();
            const values =
                ext === '.properties' ? parseProperties(content) : parseYaml(content);
            fillMissing(config, values);
        } catch {
            // Unreadable config file: fall through to defaults.
        }
    }

    if (config.port === null) {
        config.port = 8080;
    }
    if (config.contextPath === null) {
        config.contextPath = '';
    }
    config.baseUrl = `http://localhost:${config.port}${config.contextPath}`;

    return config;
}

async function findConfigFiles(projectPath) {
    if (!(await pathExists(projectPath)) || !(await isDirectory(projectPath))) {
        return [];
    }

    const files = [];
    for (const relativePath of CONFIG_LOCATIONS) {
        const filepath = path.join(projectPath, relativePath);
        if (await isFile(filepath)) {
            files.push(filepath);
        }
    }

    if (files.length > 0) {
        return files;
    }

    // Multi-module layout: use the first module with a config, sorted for
    // determinism.
    const matches = await glob('*/src/main/resources/application.{properties,yml,yaml}', {
        cwd: projectPath,
        nodir: true,
        absolute: true,
        windowsPathsNoEscape: true,
    });
    return matches.sort();
}

function fillMissing(config, values) {
    if (config.appName === null && values.appName !== undefined) {
        config.appName = values.appName;
    }
    if (config.contextPath === null && values.contextPath !== undefined) {
        config.contextPath = values.contextPath;
    }
    if (config.port === null && values.port !== undefined) {
        config.port = values.port;
    }
}

function parseProperties(content) {
    const values = {};

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
            continue;
        }

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) {
            continue;
        }

        const key = normalizeKey(trimmed.slice(0, eqIndex).trim());
        const value = trimmed.slice(eqIndex + 1).trim();

        applyConfigKey(values, key, value);
    }

    return values;
}

function parseYaml(content) {
    const values = {};

    let documents = [];
    try {
        documents = yaml.loadAll(content);
    } catch {
        // Multi-document or profile-specific YAML that fails midway: try the
        // first document alone.
        const firstDoc = content.split(/^---\s*$/m)[0];
        try {
            documents = [yaml.load(firstDoc)];
        } catch {
            return values;
        }
    }

    // Only the first (default-profile) document defines the base config.
    const data = documents.find((doc) => doc && typeof doc === 'object');
    if (!data) {
        return values;
    }

    const server = data.server || {};
    const servlet = server.servlet || {};
    const spring = data.spring || {};
    const app = spring.application || {};
    const webflux = spring.webflux || {};

    if (app.name !== undefined) {
        values.appName = String(app.name);
    }

    const contextPath =
        servlet['context-path'] ?? servlet.contextPath ?? webflux['base-path'] ?? webflux.basePath;
    if (contextPath !== undefined) {
        values.contextPath = normalizeContextPath(String(contextPath));
    }

    if (server.port !== undefined) {
        const port = parseInt(server.port, 10);
        if (!Number.isNaN(port)) {
            values.port = port;
        }
    }

    return values;
}

/**
 * Spring's relaxed binding: `server.servlet.contextPath` and
 * `server.servlet.context-path` are equivalent.
 */
function normalizeKey(key) {
    return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function applyConfigKey(values, key, value) {
    switch (key) {
        case 'spring.application.name':
            values.appName = value;
            break;
        case 'server.servlet.context-path':
        case 'spring.webflux.base-path':
            values.contextPath = normalizeContextPath(value);
            break;
        case 'server.port': {
            const port = parseInt(value, 10);
            if (!Number.isNaN(port)) {
                values.port = port;
            }
            break;
        }
        default:
            break;
    }
}

function normalizeContextPath(contextPath) {
    if (!contextPath || contextPath === '/') {
        return '';
    }
    return contextPath.startsWith('/') ? contextPath : `/${contextPath}`;
}

async function resolveProjectBaseUrl(projectPath, overrideUrl) {
    if (overrideUrl) {
        return overrideUrl;
    }

    if (!(await pathExists(projectPath))) {
        return 'http://localhost:8080';
    }

    const config = await loadProjectConfig(projectPath);
    return config.baseUrl;
}

module.exports = {
    loadProjectConfig,
    resolveProjectBaseUrl,
};
