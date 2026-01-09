const BaseStrategy = require('./base-strategy');
const OpenApiFetcher = require('../openapi/fetcher');
const OpenApiConverter = require('../openapi/converter');

class OpenApiStrategy extends BaseStrategy {
    constructor(source, logger) {
        super(source, logger);
        this.fetcher = new OpenApiFetcher(logger);
        this.converter = new OpenApiConverter(logger);
    }

    async validate() {
        try {
            const spec = await this.fetcher.fetch(this.source);
            this.fetcher.validate(spec);
            return true;
        } catch {
            return false;
        }
    }

    async extract(options = {}) {
        this.logger.debug('Using OpenAPI strategy');

        this.logger.updateSpinner('Fetching OpenAPI specification...');
        const spec = await this.fetcher.fetch(this.source);

        this.logger.debug('Validating OpenAPI specification...');
        this.fetcher.validate(spec);

        this.logger.updateSpinner('Converting to Postman collection...');
        let collection = await this.converter.convert(spec, options);

        if (options.baseUrl) {
            collection = this.converter.applyBaseUrl(collection, options.baseUrl);
        }

        return collection;
    }
}

module.exports = OpenApiStrategy;
