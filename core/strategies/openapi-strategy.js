const BaseStrategy = require('./base-strategy');
const OpenApiFetcher = require('../openapi/fetcher');
const OpenApiConverter = require('../openapi/converter');
const MockDataGenerator = require('../generator/mock-generator');
const PostmanEnhancer = require('../postman/postman-enhancer');

class OpenApiStrategy extends BaseStrategy {
    constructor(source, logger) {
        super(source, logger);
        this.fetcher = new OpenApiFetcher(logger);
        this.converter = new OpenApiConverter(logger);
        this.mockGenerator = new MockDataGenerator(logger);
        this.postmanEnhancer = new PostmanEnhancer(logger, this.mockGenerator);
    }

    async validate(options = {}) {
        try {
            const spec = await this.fetcher.fetch(this.source);
            this.fetcher.validate(spec);
            return true;
        } catch (error) {
            if (options.verbose) {
                this.logger.debug(`OpenAPI validation failed: ${error.message}`);
            }
            return false;
        }
    }

    async extract(options = {}) {
        this.logger.debug('Using OpenAPI strategy');

        if (options.seed !== undefined) {
            this.mockGenerator.setSeed(options.seed);
        }

        this.logger.updateSpinner('Fetching OpenAPI specification...');
        const spec = await this.fetcher.fetch(this.source);

        this.logger.debug('Validating OpenAPI specification...');
        this.fetcher.validate(spec);

        if (options.format === 'openapi') {
            if (options.baseUrl && spec.servers?.length) {
                spec.servers[0] = { ...spec.servers[0], url: options.baseUrl };
            }
            return spec;
        }

        this.logger.updateSpinner('Converting to Postman collection...');
        let collection = await this.converter.convert(spec, options);

        if (options.baseUrl) {
            collection = this.converter.applyBaseUrl(collection, options.baseUrl);
        }

        if (options.enhance !== false) {
            this.logger.updateSpinner('Enhancing Postman collection...');
            collection = this.postmanEnhancer.enhance(collection, options);
        }

        return collection;
    }
}

module.exports = OpenApiStrategy;
