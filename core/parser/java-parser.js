const { readFile } = require('../../lib/file-utils');
const { ParseError } = require('../../lib/errors');
const { parseJavaContent } = require('./cst-extractor');

class JavaFileParser {
    constructor(logger) {
        this.logger = logger;
    }

    async parseFile(filepath) {
        this.logger.debug(`Parsing Java file: ${filepath}`);

        try {
            const content = await readFile(filepath);
            const parsed = await parseJavaContent(content);

            return {
                filepath,
                content,
                classInfo: parsed.classInfo,
            };
        } catch (error) {
            throw new ParseError(filepath, error);
        }
    }

    async extractMethods(content) {
        const parsed = await parseJavaContent(content);
        return parsed.methods;
    }

    parseParameters(paramString) {
        if (!paramString || paramString.trim() === '') {
            return [];
        }

        const params = [];
        const parts = this.splitParameterList(paramString);

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) {
                continue;
            }

            const annotations = [];
            let cleanPart = trimmed;

            const annotationMatches = trimmed.matchAll(/@(\w+)(?:\([^)]*\))?/g);
            for (const match of annotationMatches) {
                annotations.push({
                    name: match[1],
                    raw: match[0],
                });
                cleanPart = cleanPart.replace(match[0], '').trim();
            }

            const tokens = cleanPart.split(/\s+/);
            if (tokens.length >= 2) {
                params.push({
                    type: tokens.slice(0, -1).join(' '),
                    name: tokens[tokens.length - 1],
                    annotations,
                });
            }
        }

        return params;
    }

    splitParameterList(paramString) {
        const parts = [];
        let current = '';
        let depth = 0;

        for (const char of paramString) {
            if (char === '<') {
                depth++;
            } else if (char === '>') {
                depth--;
            } else if (char === ',' && depth === 0) {
                parts.push(current);
                current = '';
                continue;
            }
            current += char;
        }

        if (current.trim()) {
            parts.push(current);
        }

        return parts;
    }
}

module.exports = JavaFileParser;
