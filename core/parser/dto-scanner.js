const { glob } = require('glob');
const { readFile, pathExists, isDirectory } = require('../../lib/file-utils');

class DtoScanner {
    constructor(logger) {
        this.logger = logger;
        this.dtoCache = new Map();
    }

    async scanProject(projectPath) {
        this.logger.debug(`Scanning for DTOs in: ${projectPath}`);

        if (!(await pathExists(projectPath)) || !(await isDirectory(projectPath))) {
            return new Map();
        }

        const patterns = [
            `${projectPath}/src/main/java/**/*DTO.java`,
            `${projectPath}/src/main/java/**/*Dto.java`,
            `${projectPath}/src/main/java/**/*Request.java`,
            `${projectPath}/src/main/java/**/*Response.java`,
            `${projectPath}/src/main/java/**/model/*.java`,
            `${projectPath}/src/main/java/**/entity/*.java`,
            `${projectPath}/src/main/java/**/domain/*.java`,
        ];

        const files = new Set();
        for (const pattern of patterns) {
            const matches = await glob(pattern, { nodir: true });
            matches.forEach(f => files.add(f));
        }

        this.logger.debug(`Found ${files.size} potential DTO files`);

        for (const file of files) {
            try {
                const dto = await this.parseDtoFile(file);
                if (dto) {
                    this.dtoCache.set(dto.name, dto);
                }
            } catch (error) {
                this.logger.debug(`Failed to parse ${file}: ${error.message}`);
            }
        }

        this.logger.debug(`Parsed ${this.dtoCache.size} DTO(s)`);
        return this.dtoCache;
    }

    async parseDtoFile(filepath) {
        const content = await readFile(filepath);

        const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
        if (!classMatch) return null;

        const className = classMatch[1];
        const fields = this.extractFields(content);

        return {
            name: className,
            filepath,
            fields,
        };
    }

    extractFields(content) {
        const fields = [];

        const fieldPattern = /(?:private|protected|public)\s+(?:final\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*[;=]/g;

        let match;
        while ((match = fieldPattern.exec(content)) !== null) {
            const type = match[1];
            const name = match[2];

            if (this.isValidField(name, type)) {
                fields.push({ name, type });
            }
        }

        return fields;
    }

    isValidField(name, type) {
        const invalidNames = ['serialVersionUID', 'logger', 'log', 'LOG'];
        const invalidTypes = ['Logger', 'Log'];

        return !invalidNames.includes(name) && !invalidTypes.includes(type);
    }

    getDto(name) {
        if (this.dtoCache.has(name)) {
            return this.dtoCache.get(name);
        }

        const baseName = name.replace(/DTO$|Dto$|Request$|Response$/, '');
        for (const [key, dto] of this.dtoCache) {
            if (key.startsWith(baseName)) {
                return dto;
            }
        }

        return null;
    }

    inferDtoFields(typeName) {
        const dto = this.getDto(typeName);
        if (dto) {
            return dto.fields;
        }

        return this.getCommonFieldsForType(typeName);
    }

    getCommonFieldsForType(typeName) {
        const lowerName = typeName.toLowerCase();

        if (lowerName.includes('user')) {
            return [
                { name: 'id', type: 'Long' },
                { name: 'name', type: 'String' },
                { name: 'email', type: 'String' },
                { name: 'createdAt', type: 'LocalDateTime' },
            ];
        }

        if (lowerName.includes('product')) {
            return [
                { name: 'id', type: 'Long' },
                { name: 'name', type: 'String' },
                { name: 'description', type: 'String' },
                { name: 'price', type: 'BigDecimal' },
            ];
        }

        if (lowerName.includes('order')) {
            return [
                { name: 'id', type: 'Long' },
                { name: 'status', type: 'String' },
                { name: 'total', type: 'BigDecimal' },
                { name: 'createdAt', type: 'LocalDateTime' },
            ];
        }

        return [
            { name: 'id', type: 'Long' },
            { name: 'name', type: 'String' },
            { name: 'createdAt', type: 'LocalDateTime' },
        ];
    }

    generateSchemaFromDto(dto) {
        const properties = {};
        const required = [];

        for (const field of dto.fields) {
            properties[field.name] = this.fieldToJsonSchema(field);
            if (field.required) {
                required.push(field.name);
            }
        }

        return {
            type: 'object',
            properties,
            ...(required.length > 0 ? { required } : {}),
        };
    }

    fieldToJsonSchema(field) {
        const typeMap = {
            'String': { type: 'string' },
            'Integer': { type: 'integer' },
            'int': { type: 'integer' },
            'Long': { type: 'integer', format: 'int64' },
            'long': { type: 'integer', format: 'int64' },
            'Double': { type: 'number', format: 'double' },
            'double': { type: 'number', format: 'double' },
            'Float': { type: 'number', format: 'float' },
            'float': { type: 'number', format: 'float' },
            'BigDecimal': { type: 'number' },
            'Boolean': { type: 'boolean' },
            'boolean': { type: 'boolean' },
            'LocalDate': { type: 'string', format: 'date' },
            'LocalDateTime': { type: 'string', format: 'date-time' },
            'UUID': { type: 'string', format: 'uuid' },
        };

        const baseType = field.type.replace(/<.*>/, '');

        if (typeMap[baseType]) {
            return typeMap[baseType];
        }

        if (field.type.match(/List<|Set</)) {
            const innerType = field.type.match(/<(.+)>/)?.[1] || 'object';
            return {
                type: 'array',
                items: this.fieldToJsonSchema({ name: field.name, type: innerType }),
            };
        }

        return { type: 'object' };
    }
}

module.exports = DtoScanner;
