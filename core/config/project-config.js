const path = require('path');
const yaml = require('js-yaml');
const { readFile, pathExists, isFile } = require('../../lib/file-utils');

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
        contextPath: '',
        port: 8080,
        baseUrl: null,
    };

    for (const relativePath of CONFIG_LOCATIONS) {
        const filepath = path.join(projectPath, relativePath);
        if (!(await isFile(filepath))) {
            continue;
        }

        const content = await readFile(filepath);
        const ext = path.extname(filepath).toLowerCase();

        if (ext === '.properties') {
            Object.assign(config, parseProperties(content, config));
        } else {
            Object.assign(config, parseYaml(content, config));
        }
    }

    if (!config.baseUrl) {
        const context = config.contextPath || '';
        config.baseUrl = `http://localhost:${config.port}${context}`;
    }

    return config;
}

function parseProperties(content, existing = {}) {
    const result = { ...existing };

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();

        applyConfigKey(result, key, value);
    }

    return result;
}

function parseYaml(content, existing = {}) {
    const result = { ...existing };

    try {
        const data = yaml.load(content);
        if (!data || typeof data !== 'object') {
            return result;
        }

        const server = data.server || {};
        const servlet = server.servlet || {};
        const spring = data.spring || {};
        const app = spring.application || {};

        if (app.name) {
            result.appName = String(app.name);
        }
        if (servlet['context-path']) {
            result.contextPath = normalizeContextPath(String(servlet['context-path']));
        }
        if (server.port !== undefined) {
            result.port = parseInt(server.port, 10) || result.port;
        }
    } catch {
        // ignore invalid yaml
    }

    return result;
}

function applyConfigKey(config, key, value) {
    switch (key) {
        case 'spring.application.name':
            config.appName = value;
            break;
        case 'server.servlet.context-path':
            config.contextPath = normalizeContextPath(value);
            break;
        case 'server.port':
            config.port = parseInt(value, 10) || config.port;
            break;
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
