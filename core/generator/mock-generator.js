const { faker } = require('@faker-js/faker');

/**
 * Schema-driven example generation.
 *
 * The declared schema always wins: an integer field named "status" gets an
 * integer, an enum field gets one of its real values, formats (uuid, email,
 * date-time, ...) are honored. Field-name hints only refine plain strings.
 * With a seed set, output is fully deterministic (no unseeded Date calls).
 */
class ExampleGenerator {
    constructor(logger) {
        this.logger = logger;
        this.seeded = false;
    }

    setSeed(seed) {
        const numeric = typeof seed === 'number' ? seed : parseInt(seed, 10);
        faker.seed(Number.isNaN(numeric) ? 0 : numeric);
        this.seeded = true;
    }

    /**
     * Generate an example value for a JSON schema.
     *
     * @param {object|null} schema
     * @param {object} schemas components.schemas registry for $ref resolution
     * @param {string} fieldName current property name (string hints only)
     * @param {Set<string>} visitedRefs cycle guard
     * @param {number} depth recursion guard
     */
    fromSchema(schema, schemas = {}, fieldName = '', visitedRefs = new Set(), depth = 0) {
        if (schema === null || schema === undefined || depth > 6) {
            return null;
        }

        if (schema === true) {
            return {};
        }

        if (schema.$ref) {
            const name = schema.$ref.split('/').pop();
            if (visitedRefs.has(name)) {
                // Recursive type: stop expanding.
                return schema.$ref.includes('/') ? {} : null;
            }
            const target = schemas[name];
            if (!target) {
                return {};
            }
            const nextVisited = new Set(visitedRefs);
            nextVisited.add(name);
            return this.fromSchema(target, schemas, fieldName, nextVisited, depth + 1);
        }

        if (schema.example !== undefined) {
            return schema.example;
        }

        if (schema.default !== undefined) {
            return schema.default;
        }

        if (Array.isArray(schema.enum) && schema.enum.length > 0) {
            return schema.enum[0];
        }

        switch (schema.type) {
            case 'string':
                return this.stringExample(schema, fieldName);
            case 'integer':
                return this.integerExample(schema);
            case 'number':
                return this.numberExample(schema);
            case 'boolean':
                return true;
            case 'array': {
                const count = Math.max(schema.minItems || 0, 1);
                const items = [];
                for (let i = 0; i < Math.min(count, 2); i++) {
                    items.push(
                        this.fromSchema(schema.items, schemas, fieldName, visitedRefs, depth + 1),
                    );
                }
                return items;
            }
            case 'object':
            default:
                return this.objectExample(schema, schemas, visitedRefs, depth);
        }
    }

    objectExample(schema, schemas, visitedRefs, depth) {
        if (schema.properties) {
            const result = {};
            for (const [name, propSchema] of Object.entries(schema.properties)) {
                result[name] = this.fromSchema(propSchema, schemas, name, visitedRefs, depth + 1);
            }
            return result;
        }

        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            return {
                key: this.fromSchema(
                    schema.additionalProperties,
                    schemas,
                    '',
                    visitedRefs,
                    depth + 1,
                ),
            };
        }

        return {};
    }

    stringExample(schema, fieldName) {
        switch (schema.format) {
            case 'uuid':
                return faker.string.uuid();
            case 'email':
                return faker.internet.email().toLowerCase();
            case 'date':
                return this.isoDate().slice(0, 10);
            case 'date-time':
                return this.isoDate();
            case 'time':
                return '14:30:00';
            case 'uri':
            case 'url':
                return 'https://example.com/resource';
            case 'binary':
                return '<binary content>';
            case 'byte':
                return 'ZXhhbXBsZQ==';
            case 'password':
                return faker.internet.password({ length: 12 });
            default:
                break;
        }

        let value = this.stringFromFieldName(fieldName);
        if (value === null) {
            value = faker.lorem.word();
        }

        if (schema.minLength && value.length < schema.minLength) {
            value = value.padEnd(schema.minLength, 'a');
        }
        if (schema.maxLength && value.length > schema.maxLength) {
            value = value.slice(0, schema.maxLength);
        }

        return value;
    }

    /**
     * Name-based hints, applied only to plain strings — never overrides
     * declared types or formats.
     */
    stringFromFieldName(fieldName) {
        if (!fieldName) {
            return null;
        }
        const name = fieldName.toLowerCase();

        if (/e?mail/.test(name)) return faker.internet.email().toLowerCase();
        if (/^first.?name$/.test(name)) return faker.person.firstName();
        if (/^last.?name|surname$/.test(name)) return faker.person.lastName();
        if (/user.?name|login/.test(name)) return faker.internet.userName().toLowerCase();
        if (/(^|_)name$|display.?name|full.?name/.test(name)) return faker.person.fullName();
        if (/phone|mobile|celular/.test(name)) return faker.phone.number();
        if (/password|senha/.test(name)) return faker.internet.password({ length: 12 });
        if (/city|cidade/.test(name)) return faker.location.city();
        if (/country|pais/.test(name)) return faker.location.country();
        if (/street|address|endereco/.test(name)) return faker.location.streetAddress();
        if (/zip|postal|cep/.test(name)) return faker.location.zipCode();
        if (/url|link|website/.test(name)) return 'https://example.com';
        if (/description|note|comment|descricao/.test(name)) return faker.lorem.sentence();
        if (/title|subject|titulo/.test(name)) return faker.lorem.words(3);
        if (/token|secret|key$/.test(name)) return faker.string.alphanumeric(24);
        if (/code|codigo|sku|slug/.test(name)) return faker.string.alphanumeric(8).toLowerCase();
        if (/currency|moeda/.test(name)) return 'USD';

        return null;
    }

    integerExample(schema) {
        const min = schema.minimum !== undefined ? Math.ceil(schema.minimum) : 1;
        const max =
            schema.maximum !== undefined
                ? Math.floor(schema.maximum)
                : Math.max(min + 99, min);
        return faker.number.int({ min, max });
    }

    numberExample(schema) {
        const min = schema.minimum !== undefined ? schema.minimum : 0;
        const max = schema.maximum !== undefined ? schema.maximum : Math.max(min + 999, min);
        const value = faker.number.float({ min, max, fractionDigits: 2 });
        return value;
    }

    /**
     * Deterministic under seed: generated via faker, never `new Date()`.
     */
    isoDate() {
        const date = faker.date.between({
            from: '2024-01-01T00:00:00.000Z',
            to: '2025-12-31T23:59:59.000Z',
        });
        return date.toISOString();
    }
}

module.exports = ExampleGenerator;
