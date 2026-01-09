class BaseStrategy {
    constructor(source, logger) {
        if (this.constructor === BaseStrategy) {
            throw new Error('BaseStrategy is abstract and cannot be instantiated');
        }
        this.source = source;
        this.logger = logger;
    }

    async extract() {
        throw new Error('extract() must be implemented by subclass');
    }

    async validate() {
        throw new Error('validate() must be implemented by subclass');
    }

    getName() {
        return this.constructor.name;
    }
}

module.exports = BaseStrategy;
