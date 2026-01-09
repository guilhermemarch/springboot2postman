const { readFile } = require('../../lib/file-utils');
const { ParseError } = require('../../lib/errors');

class JavaFileParser {
    constructor(logger) {
        this.logger = logger;
    }

    async parseFile(filepath) {
        this.logger.debug(`Parsing Java file: ${filepath}`);

        try {
            const content = await readFile(filepath);
            const classInfo = this.extractClassInfo(content);

            return {
                filepath,
                content,
                classInfo,
            };
        } catch (error) {
            throw new ParseError(filepath, error);
        }
    }

    extractClassInfo(content) {
        const packageMatch = content.match(/package\s+([\w.]+);/);
        const packageName = packageMatch ? packageMatch[1] : null;

        const classMatch = content.match(/(?:public\s+)?class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'Unknown';

        const classAnnotations = this.extractAnnotationsFromContent(content, 'class');

        return {
            packageName,
            className,
            annotations: classAnnotations,
        };
    }

    extractAnnotationsFromContent(content, beforeKeyword) {
        const annotations = [];
        const lines = content.split('\n');
        let foundKeyword = false;

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();

            if (line.includes(beforeKeyword)) {
                foundKeyword = true;
                continue;
            }

            if (foundKeyword && line.startsWith('@')) {
                const match = line.match(/@(\w+)(?:\((.+)\))?/);
                if (match) {
                    annotations.unshift({
                        name: match[1],
                        value: match[2] || null,
                        raw: line,
                    });
                }
            }

            if (foundKeyword && (line.includes('class') || line.includes('public') || line.includes('private'))) {
                break;
            }
        }

        return annotations;
    }

    extractMethods(content) {
        const methods = [];
        const methodPattern = /(?:public|private|protected)\s+(?:static\s+)?(?:<[^>]+>\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)/g;

        let match;
        while ((match = methodPattern.exec(content)) !== null) {
            const returnType = match[1];
            const methodName = match[2];
            const params = match[3];

            const beforeMethod = content.substring(0, match.index);
            const lineNumber = beforeMethod.split('\n').length;
            const annotations = this.extractMethodAnnotations(content, match.index);

            methods.push({
                name: methodName,
                returnType,
                parameters: params,
                annotations,
                lineNumber,
            });
        }

        return methods;
    }

    extractMethodAnnotations(content, methodIndex) {
        const annotations = [];
        const beforeMethod = content.substring(0, methodIndex);
        const lines = beforeMethod.split('\n');

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();

            if (line.startsWith('@')) {
                const match = line.match(/@(\w+)(?:\((.+)\))?/);
                if (match) {
                    annotations.unshift({
                        name: match[1],
                        value: match[2] || null,
                        raw: line,
                    });
                }
            } else if (line && !line.startsWith('//') && !line.startsWith('/*')) {
                break;
            }
        }

        return annotations;
    }

    parseParameters(paramString) {
        if (!paramString || paramString.trim() === '') {
            return [];
        }

        const params = [];
        const paramParts = paramString.split(',');

        for (const part of paramParts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

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

            const parts = cleanPart.split(/\s+/);
            if (parts.length >= 2) {
                const type = parts[parts.length - 2];
                const name = parts[parts.length - 1];

                params.push({
                    type,
                    name,
                    annotations,
                });
            }
        }

        return params;
    }
}

module.exports = JavaFileParser;
