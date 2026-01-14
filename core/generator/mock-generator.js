const { faker } = require('@faker-js/faker');

class MockDataGenerator {
    constructor(logger) {
        this.logger = logger;
        this.fieldPatterns = this.initFieldPatterns();
    }

    initFieldPatterns() {
        return [
            { pattern: /email/i, generator: () => faker.internet.email() },
            { pattern: /^name$|firstName|lastName|fullName/i, generator: () => faker.person.fullName() },
            { pattern: /^firstName$/i, generator: () => faker.person.firstName() },
            { pattern: /^lastName$/i, generator: () => faker.person.lastName() },
            { pattern: /username|login/i, generator: () => faker.internet.username() },
            { pattern: /password/i, generator: () => '********' },
            { pattern: /phone|mobile|tel/i, generator: () => faker.phone.number() },
            { pattern: /address|street/i, generator: () => faker.location.streetAddress() },
            { pattern: /city/i, generator: () => faker.location.city() },
            { pattern: /state|province/i, generator: () => faker.location.state() },
            { pattern: /country/i, generator: () => faker.location.country() },
            { pattern: /zip|postal/i, generator: () => faker.location.zipCode() },
            { pattern: /url|website|link/i, generator: () => faker.internet.url() },
            { pattern: /image|avatar|photo|picture/i, generator: () => faker.image.avatar() },
            { pattern: /title/i, generator: () => faker.lorem.sentence(3) },
            { pattern: /description|bio|about|summary/i, generator: () => faker.lorem.paragraph(1) },
            { pattern: /content|body|text/i, generator: () => faker.lorem.paragraphs(2) },
            { pattern: /company|organization/i, generator: () => faker.company.name() },
            { pattern: /job|position|role/i, generator: () => faker.person.jobTitle() },
            { pattern: /price|amount|cost|total/i, generator: () => parseFloat(faker.commerce.price()) },
            { pattern: /quantity|count|qty/i, generator: () => faker.number.int({ min: 1, max: 100 }) },
            { pattern: /age/i, generator: () => faker.number.int({ min: 18, max: 80 }) },
            { pattern: /rating|score/i, generator: () => faker.number.int({ min: 1, max: 5 }) },
            { pattern: /status/i, generator: () => faker.helpers.arrayElement(['ACTIVE', 'INACTIVE', 'PENDING']) },
            { pattern: /type|category/i, generator: () => faker.helpers.arrayElement(['TYPE_A', 'TYPE_B', 'TYPE_C']) },
            { pattern: /uuid|guid/i, generator: () => faker.string.uuid() },
            { pattern: /token/i, generator: () => faker.string.alphanumeric(32) },
            { pattern: /code/i, generator: () => faker.string.alphanumeric(8).toUpperCase() },
        ];
    }

    generateForField(fieldName, javaType) {
        for (const { pattern, generator } of this.fieldPatterns) {
            if (pattern.test(fieldName)) {
                return generator();
            }
        }
        return this.generateForType(javaType, fieldName);
    }

    generateForType(javaType, fieldName = '') {
        if (!javaType) return 'example';

        const baseType = javaType.replace(/<.*>/, '').trim();

        const typeGenerators = {
            'String': () => this.generateStringValue(fieldName),
            'char': () => 'A',
            'Character': () => 'A',
            'int': () => faker.number.int({ min: 1, max: 100 }),
            'Integer': () => faker.number.int({ min: 1, max: 100 }),
            'short': () => faker.number.int({ min: 1, max: 100 }),
            'Short': () => faker.number.int({ min: 1, max: 100 }),
            'long': () => faker.number.int({ min: 1, max: 10000 }),
            'Long': () => faker.number.int({ min: 1, max: 10000 }),
            'byte': () => faker.number.int({ min: 0, max: 127 }),
            'Byte': () => faker.number.int({ min: 0, max: 127 }),
            'float': () => parseFloat(faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })),
            'Float': () => parseFloat(faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })),
            'double': () => parseFloat(faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })),
            'Double': () => parseFloat(faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })),
            'BigDecimal': () => parseFloat(faker.number.float({ min: 0, max: 10000, fractionDigits: 2 })),
            'BigInteger': () => faker.number.int({ min: 1, max: 1000000 }),
            'boolean': () => faker.datatype.boolean(),
            'Boolean': () => faker.datatype.boolean(),
            'Date': () => faker.date.recent().toISOString(),
            'LocalDate': () => faker.date.recent().toISOString().split('T')[0],
            'LocalDateTime': () => faker.date.recent().toISOString().replace('Z', ''),
            'ZonedDateTime': () => faker.date.recent().toISOString(),
            'Instant': () => faker.date.recent().toISOString(),
            'Timestamp': () => faker.date.recent().toISOString(),
            'UUID': () => faker.string.uuid(),
            'Object': () => ({}),
        };

        if (typeGenerators[baseType]) {
            return typeGenerators[baseType]();
        }

        if (javaType.match(/List<|ArrayList<|Set<|Collection</)) {
            const innerType = this.extractGenericType(javaType);
            return [
                this.generateForType(innerType, fieldName),
                this.generateForType(innerType, fieldName),
            ];
        }

        if (javaType.match(/Map<|HashMap</)) {
            return { key1: 'value1', key2: 'value2' };
        }

        if (javaType.startsWith('ResponseEntity<') || javaType.startsWith('Optional<')) {
            const innerType = this.extractGenericType(javaType);
            return this.generateForType(innerType, fieldName);
        }

        return null;
    }

    generateStringValue(fieldName) {
        for (const { pattern, generator } of this.fieldPatterns) {
            if (pattern.test(fieldName)) {
                return generator();
            }
        }
        return faker.lorem.word();
    }

    extractGenericType(javaType) {
        const match = javaType.match(/<(.+)>/);
        return match ? match[1].trim() : 'Object';
    }

    generateDtoExample(dtoName, fields) {
        const example = {};

        if (dtoName.toLowerCase().includes('user')) {
            example.id = faker.number.int({ min: 1, max: 1000 });
            example.name = faker.person.fullName();
            example.email = faker.internet.email();
        }

        for (const field of fields || []) {
            if (!example[field.name]) {
                example[field.name] = this.generateForField(field.name, field.type);
            }
        }

        return example;
    }

    generateRequestExample(dtoName, fields, _method) {
        const example = this.generateDtoExample(dtoName, fields);

        if (_method === 'POST' || _method === 'PUT') {
            delete example.id;
            delete example.createdAt;
            delete example.updatedAt;
        }

        return example;
    }

    generateResponseExample(dtoName, fields, _method) {
        const example = this.generateDtoExample(dtoName, fields);

        if (!example.id) {
            example.id = faker.number.int({ min: 1, max: 1000 });
        }
        if (!example.createdAt) {
            example.createdAt = faker.date.recent().toISOString();
        }

        return example;
    }

    generateListResponse(dtoName, fields, count = 2) {
        return Array.from({ length: count }, () =>
            this.generateResponseExample(dtoName, fields, 'GET')
        );
    }

    generateErrorResponse(status, message, path) {
        return {
            timestamp: new Date().toISOString(),
            status,
            error: this.getErrorName(status),
            message,
            path,
        };
    }

    getErrorName(status) {
        const errors = {
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            409: 'Conflict',
            422: 'Unprocessable Entity',
            500: 'Internal Server Error',
        };
        return errors[status] || 'Error';
    }
}

module.exports = MockDataGenerator;
