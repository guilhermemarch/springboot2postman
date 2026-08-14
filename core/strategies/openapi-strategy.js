const BaseStrategy = require('./base-strategy');
const OpenApiFetcher = require('../openapi/fetcher');
const OpenApiConverter = require('../openapi/converter');
const ExampleGenerator = require('../generator/mock-generator');
const PostmanEnhancer = require('../postman/postman-enhancer');
const RunReport = require('../report/run-report');
const { renderHttpFile } = require('../output/http-format');
const { countOpenApiEndpoints } = require('../../lib/endpoint-counter');

class OpenApiStrategy extends BaseStrategy {
    constructor(source, logger) {
        super(source, logger);
        this.fetcher = new OpenApiFetcher(logger);
        this.converter = new OpenApiConverter(logger);
        this.enhancer = new PostmanEnhancer(logger);
        this._spec = null;
    }

    /**
     * Fetch once and cache: validate() runs during strategy detection and
     * extract() must not hit the network a second time.
     */
    async getSpec(options = {}) {
        if (!this._spec) {
            this._spec = await this.fetcher.fetch(this.source, {
                headers: options.headers,
                bearer: options.bearer,
            });
        }
        return this._spec;
    }

    async validate(options = {}) {
        try {
            const spec = await this.getSpec(options);
            this.fetcher.validate(spec);
            return true;
        } catch (error) {
            this._spec = null;
            if (options.verbose) {
                this.logger.debug(`OpenAPI validation failed: ${error.message}`);
            }
            return false;
        }
    }

    async extract(options = {}) {
        this.logger.debug('Using OpenAPI strategy');

        const report = new RunReport();
        report.strategy = 'openapi';

        this.logger.updateSpinner('Fetching OpenAPI specification...');
        const spec = await this.getSpec(options);
        this.fetcher.validate(spec);

        if (options.baseUrl) {
            spec.servers = [{ url: options.baseUrl }, ...(spec.servers || []).slice(1)];
        }

        report.endpoints = countOpenApiEndpoints(spec);
        report.schemaCount = Object.keys(spec.components?.schemas || {}).length;

        if (options.format === 'openapi') {
            return { output: spec, spec, report };
        }

        if (options.format === 'http') {
            const examples = new ExampleGenerator(this.logger);
            examples.setSeed(options.seed !== undefined ? options.seed : 1);
            return { output: renderHttpFile(spec, examples), spec, report };
        }

        this.logger.updateSpinner('Converting to Postman collection...');
        let collection = await this.converter.convert(spec, options);

        if (options.baseUrl) {
            collection = this.converter.applyBaseUrl(collection, options.baseUrl);
        }

        if (options.enhance !== false) {
            collection = this.enhancer.enhance(collection, {
                baseUrl: options.baseUrl,
                spec,
            });
        }

        return { output: collection, spec, report };
    }
}

module.exports = OpenApiStrategy;
