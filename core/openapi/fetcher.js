const axios = require('axios');
const yaml = require('js-yaml');
const { readFile, isUrl, pathExists, getExtension } = require('../../lib/file-utils');
const {
    OpenApiFetchError,
    InvalidOpenApiError,
    ProjectNotFoundError,
} = require('../../lib/errors');

const MAX_SPEC_SIZE = 50 * 1024 * 1024; // 50 MB

class OpenApiFetcher {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * @param {string} source URL or file path
     * @param {object} options { headers: ['Name: value', ...], bearer: 'token' }
     */
    async fetch(source, options = {}) {
        this.logger.debug(`Fetching OpenAPI from: ${source}`);

        if (isUrl(source)) {
            return await this.fetchFromUrl(source, options);
        }
        return await this.fetchFromFile(source);
    }

    buildRequestHeaders(options) {
        const headers = {
            Accept: 'application/json, application/yaml, application/x-yaml, text/plain',
        };

        for (const header of options.headers || []) {
            const separator = header.indexOf(':');
            if (separator > 0) {
                headers[header.slice(0, separator).trim()] = header.slice(separator + 1).trim();
            }
        }

        if (options.bearer) {
            headers.Authorization = `Bearer ${options.bearer}`;
        }

        return headers;
    }

    async fetchFromUrl(url, options = {}) {
        try {
            const response = await axios.get(url, {
                timeout: 30000,
                maxContentLength: MAX_SPEC_SIZE,
                maxBodyLength: MAX_SPEC_SIZE,
                headers: this.buildRequestHeaders(options),
                // Keep the raw body so YAML served as text/plain still parses.
                transformResponse: [(data) => data],
                responseType: 'text',
            });

            return this.parseSpecText(response.data, url);
        } catch (error) {
            if (error instanceof InvalidOpenApiError) {
                throw error;
            }
            throw new OpenApiFetchError(url, this.describeHttpError(error));
        }
    }

    describeHttpError(error) {
        if (error.response) {
            const { status, statusText } = error.response;
            const hint =
                status === 401 || status === 403
                    ? ' (use --header or --bearer for protected endpoints)'
                    : '';
            return new Error(`HTTP ${status} ${statusText || ''}`.trim() + hint);
        }
        if (error.code) {
            return new Error(`${error.code}: ${error.message}`);
        }
        return error;
    }

    parseSpecText(text, source) {
        if (typeof text === 'object' && text !== null) {
            return text;
        }

        const trimmed = String(text).trim();

        if (trimmed.startsWith('<')) {
            throw new InvalidOpenApiError(
                `${source} returned HTML instead of an OpenAPI document (login page or wrong URL?)`,
            );
        }

        try {
            return JSON.parse(trimmed);
        } catch {
            try {
                return yaml.load(trimmed);
            } catch (yamlError) {
                throw new InvalidOpenApiError(
                    `Could not parse response as JSON or YAML: ${yamlError.message}`,
                );
            }
        }
    }

    async fetchFromFile(filepath) {
        if (!(await pathExists(filepath))) {
            throw new ProjectNotFoundError(filepath);
        }

        try {
            this.logger.debug(`Reading file: ${filepath}`);
            const content = await readFile(filepath);
            const ext = getExtension(filepath);

            if (ext === '.yaml' || ext === '.yml') {
                return yaml.load(content);
            }
            if (ext === '.json') {
                return JSON.parse(content);
            }
            return this.parseSpecText(content, filepath);
        } catch (error) {
            if (error instanceof ProjectNotFoundError || error instanceof InvalidOpenApiError) {
                throw error;
            }
            throw new OpenApiFetchError(filepath, error);
        }
    }

    validate(spec) {
        if (!spec || typeof spec !== 'object') {
            throw new InvalidOpenApiError('Specification is not a valid object');
        }

        // YAML parses unquoted `openapi: 3.0` as a number.
        const openapiVersion = spec.openapi !== undefined ? String(spec.openapi) : null;
        const swaggerVersion = spec.swagger !== undefined ? String(spec.swagger) : null;

        if (openapiVersion) {
            if (!openapiVersion.startsWith('3')) {
                throw new InvalidOpenApiError(`Unsupported OpenAPI version: ${openapiVersion}`);
            }
        } else if (swaggerVersion) {
            if (!swaggerVersion.startsWith('2')) {
                throw new InvalidOpenApiError(`Unsupported Swagger version: ${swaggerVersion}`);
            }
        } else {
            throw new InvalidOpenApiError('Missing "openapi" or "swagger" version field');
        }

        if (!spec.paths || typeof spec.paths !== 'object') {
            throw new InvalidOpenApiError('Missing or invalid "paths" field');
        }

        this.logger.debug(`Valid ${openapiVersion || `Swagger ${swaggerVersion}`} specification`);
        return true;
    }
}

module.exports = OpenApiFetcher;
