class TypeResolver {
    constructor(logger) {
        this.logger = logger;
    }

    resolveType(javaType) {
        const baseType = javaType.replace(/<.*>/, '').trim();

        const typeMap = {
            'String': { type: 'string' },
            'char': { type: 'string' },
            'Character': { type: 'string' },
            'int': { type: 'integer', format: 'int32' },
            'Integer': { type: 'integer', format: 'int32' },
            'short': { type: 'integer', format: 'int32' },
            'Short': { type: 'integer', format: 'int32' },
            'long': { type: 'integer', format: 'int64' },
            'Long': { type: 'integer', format: 'int64' },
            'byte': { type: 'integer' },
            'Byte': { type: 'integer' },
            'float': { type: 'number', format: 'float' },
            'Float': { type: 'number', format: 'float' },
            'double': { type: 'number', format: 'double' },
            'Double': { type: 'number', format: 'double' },
            'BigDecimal': { type: 'number' },
            'BigInteger': { type: 'integer' },
            'boolean': { type: 'boolean' },
            'Boolean': { type: 'boolean' },
            'Date': { type: 'string', format: 'date-time' },
            'LocalDate': { type: 'string', format: 'date' },
            'LocalDateTime': { type: 'string', format: 'date-time' },
            'ZonedDateTime': { type: 'string', format: 'date-time' },
            'Instant': { type: 'string', format: 'date-time' },
            'Timestamp': { type: 'string', format: 'date-time' },
            'UUID': { type: 'string', format: 'uuid' },
            'URI': { type: 'string', format: 'uri' },
            'URL': { type: 'string', format: 'uri' },
            'Object': { type: 'object' },
            'Map': { type: 'object' },
            'HashMap': { type: 'object' },
            'LinkedHashMap': { type: 'object' },
        };

        if (typeMap[baseType]) {
            return typeMap[baseType];
        }

        if (javaType.match(/List<|ArrayList<|Set<|HashSet<|Collection</)) {
            const innerType = this.extractGenericType(javaType);
            return {
                type: 'array',
                items: this.resolveType(innerType),
            };
        }

        if (javaType.match(/Map<|HashMap<|LinkedHashMap</)) {
            return {
                type: 'object',
                additionalProperties: true,
            };
        }

        if (javaType.startsWith('ResponseEntity<')) {
            const innerType = this.extractGenericType(javaType);
            return this.resolveType(innerType);
        }

        if (javaType.startsWith('Optional<')) {
            const innerType = this.extractGenericType(javaType);
            return this.resolveType(innerType);
        }

        if (javaType.startsWith('Mono<')) {
            const innerType = this.extractGenericType(javaType);
            return this.resolveType(innerType);
        }

        if (javaType.startsWith('Flux<')) {
            const innerType = this.extractGenericType(javaType);
            return {
                type: 'array',
                items: this.resolveType(innerType),
            };
        }

        this.logger.debug(`Unknown type: ${javaType}, treating as object (will create schema)`);

        return {
            $ref: `#/components/schemas/${baseType}`,
        };
    }

    extractGenericType(javaType) {
        const match = javaType.match(/<(.+)>/);
        if (match) {
            const genericType = match[1].trim();

            if (genericType.includes('<') && genericType.endsWith('>')) {
                const depth = this.countChar(genericType, '<');
                if (depth > 0) {
                    return genericType;
                }
            }

            return genericType;
        }
        return 'Object';
    }

    countChar(str, char) {
        let count = 0;
        for (const c of str) {
            if (c === char) count++;
        }
        return count;
    }

    generateExample(javaType) {
        const baseType = javaType.replace(/<.*>/, '').trim();

        const examples = {
            'String': 'example',
            'int': 1,
            'Integer': 1,
            'long': 1,
            'Long': 1,
            'float': 1.0,
            'Float': 1.0,
            'double': 1.0,
            'Double': 1.0,
            'boolean': true,
            'Boolean': true,
            'Date': '2024-01-01T00:00:00Z',
            'LocalDate': '2024-01-01',
            'LocalDateTime': '2024-01-01T00:00:00',
            'UUID': '123e4567-e89b-12d3-a456-426614174000',
        };

        if (examples[baseType]) {
            return examples[baseType];
        }

        if (javaType.match(/List<|ArrayList<|Set</)) {
            return [];
        }

        return {};
    }

    isPrimitive(javaType) {
        const primitives = [
            'String', 'char', 'Character',
            'int', 'Integer', 'long', 'Long', 'short', 'Short', 'byte', 'Byte',
            'float', 'Float', 'double', 'Double',
            'boolean', 'Boolean',
        ];

        const baseType = javaType.replace(/<.*>/, '').trim();
        return primitives.includes(baseType);
    }

    isCollection(javaType) {
        return javaType.match(/List<|ArrayList<|Set<|HashSet<|Collection</) !== null;
    }

    needsSchema(javaType) {
        const baseType = javaType.replace(/<.*>/, '').trim();

        if (this.isPrimitive(javaType)) return false;
        if (['Object', 'Map', 'HashMap', 'Date', 'LocalDate', 'UUID'].includes(baseType)) return false;
        if (this.isCollection(javaType)) {
            const innerType = this.extractGenericType(javaType);
            return this.needsSchema(innerType);
        }

        return true;
    }
}

module.exports = TypeResolver;
