const Converter = require('openapi-to-postmanv2');
const { ConversionError } = require('../../lib/errors');

class OpenApiConverter {
    constructor(logger) {
        this.logger = logger;
    }

    async convert(openApiSpec, options = {}) {
        this.logger.debug('Converting OpenAPI to Postman Collection...');

        const conversionOptions = {
            folderStrategy: options.folderStrategy || 'Tags',
            requestParametersResolution: 'Example',
            exampleParametersResolution: 'Example',
            // Auth is represented natively on the collection; injecting auth
            // headers into examples duplicates it.
            includeAuthInfoInExample: false,
        };

        return new Promise((resolve, reject) => {
            Converter.convert(
                { type: 'json', data: openApiSpec },
                conversionOptions,
                (err, result) => {
                    try {
                        if (err) {
                            return reject(new ConversionError(err.message));
                        }

                        if (!result.result) {
                            return reject(
                                new ConversionError(result.reason || 'Unknown conversion error'),
                            );
                        }

                        if (!Array.isArray(result.output) || result.output.length === 0) {
                            return reject(
                                new ConversionError('Converter produced no output'),
                            );
                        }

                        if (result.reason) {
                            this.logger.warn(`Converter warning: ${result.reason}`);
                        }

                        const collection = result.output[0].data;
                        this.logger.debug(`Conversion successful: ${collection.info.name}`);
                        resolve(collection);
                    } catch (callbackError) {
                        // Throwing inside the converter callback would escape
                        // the promise; reject instead.
                        reject(new ConversionError(callbackError.message));
                    }
                },
            );
        });
    }

    applyBaseUrl(collection, baseUrl) {
        if (!baseUrl) return collection;

        this.logger.debug(`Applying base URL: ${baseUrl}`);

        if (!collection.variable) {
            collection.variable = [];
        }

        const baseUrlVar = collection.variable.find((v) => v.key === 'baseUrl');
        if (baseUrlVar) {
            baseUrlVar.value = baseUrl;
        } else {
            collection.variable.push({
                key: 'baseUrl',
                value: baseUrl,
                type: 'string',
            });
        }

        return collection;
    }
}

module.exports = OpenApiConverter;
