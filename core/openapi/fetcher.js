const axios = require('axios');
const yaml = require('js-yaml');
const { readFile, isUrl, pathExists, getExtension } = require('../../lib/file-utils');
const { OpenApiFetchError, InvalidOpenApiError, ProjectNotFoundError } = require('../../lib/errors');

class OpenApiFetcher {
    constructor(logger) {
        this.logger = logger;
    }

    async fetch(source) {
        this.logger.debug(`Fetching OpenAPI from: ${source}`);

        if (isUrl(source)) {
            return await this.fetchFromUrl(source);
        } else {
            return await this.fetchFromFile(source);
        }
    }

    async fetchFromUrl(url) {
        try {
            this.logger.debug(`Making HTTP request to: ${url}`);
            const response = await axios.get(url, {
                timeout: 30000,
                headers: {
                    'Accept': 'application/json, application/yaml, application/x-yaml',
                },
            });

            const contentType = response.headers['content-type'] || '';

            if (contentType.includes('yaml') || contentType.includes('yml')) {
                return yaml.load(response.data);
            }

            return response.data;
        } catch (error) {
            throw new OpenApiFetchError(url, error);
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
            } else if (ext === '.json') {
                return JSON.parse(content);
            } else {
                try {
                    return JSON.parse(content);
                } catch {
                    return yaml.load(content);
                }
            }
        } catch (error) {
            if (error instanceof ProjectNotFoundError) {
                throw error;
            }
            throw new OpenApiFetchError(filepath, error);
        }
    }

    validate(spec) {
        if (!spec || typeof spec !== 'object') {
            throw new InvalidOpenApiError('Specification is not a valid object');
        }

        if (spec.openapi) {
            if (!spec.openapi.startsWith('3.')) {
                throw new InvalidOpenApiError(`Unsupported OpenAPI version: ${spec.openapi}`);
            }
        } else if (spec.swagger) {
            if (spec.swagger !== '2.0') {
                throw new InvalidOpenApiError(`Unsupported Swagger version: ${spec.swagger}`);
            }
        } else {
            throw new InvalidOpenApiError('Missing "openapi" or "swagger" version field');
        }

        if (!spec.paths || typeof spec.paths !== 'object') {
            throw new InvalidOpenApiError('Missing or invalid "paths" field');
        }

        this.logger.debug(`Valid ${spec.openapi || 'Swagger ' + spec.swagger} specification`);
        return true;
    }
}

module.exports = OpenApiFetcher;
