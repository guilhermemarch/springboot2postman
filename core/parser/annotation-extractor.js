class AnnotationExtractor {
    constructor(logger) {
        this.logger = logger;
    }

    extractBasePath(classAnnotations) {
        for (const annotation of classAnnotations) {
            if (annotation.name === 'RequestMapping') {
                return this.extractValueFromAnnotation(annotation);
            }
        }
        return '';
    }

    extractEndpointInfo(methodAnnotations) {
        const mappingAnnotations = [
            'GetMapping',
            'PostMapping',
            'PutMapping',
            'DeleteMapping',
            'PatchMapping',
            'RequestMapping',
        ];

        for (const annotation of methodAnnotations) {
            if (mappingAnnotations.includes(annotation.name)) {
                const path = this.extractValueFromAnnotation(annotation);
                const method = this.getHttpMethod(annotation.name, annotation.value);

                return {
                    method,
                    path,
                    annotation: annotation.name,
                };
            }
        }

        return null;
    }

    getHttpMethod(annotationName, annotationValue) {
        const mapping = {
            'GetMapping': 'GET',
            'PostMapping': 'POST',
            'PutMapping': 'PUT',
            'DeleteMapping': 'DELETE',
            'PatchMapping': 'PATCH',
            'RequestMapping': 'GET',
        };

        let method = mapping[annotationName];

        if (annotationName === 'RequestMapping' && annotationValue) {
            const methodMatch = annotationValue.match(/method\s*=\s*RequestMethod\.(\w+)/);
            if (methodMatch) {
                method = methodMatch[1].toUpperCase();
            }
        }

        return method;
    }

    extractValueFromAnnotation(annotation) {
        if (!annotation.value) {
            return '';
        }

        const value = annotation.value.trim();

        const valueMatch = value.match(/value\s*=\s*"([^"]+)"/);
        if (valueMatch) {
            return valueMatch[1];
        }

        const stringMatch = value.match(/"([^"]+)"/);
        if (stringMatch) {
            return stringMatch[1];
        }

        const pathMatch = value.match(/path\s*=\s*"([^"]+)"/);
        if (pathMatch) {
            return pathMatch[1];
        }

        return '';
    }

    extractParameterInfo(paramAnnotations, paramName, paramType) {
        for (const annotation of paramAnnotations) {
            switch (annotation.name) {
                case 'PathVariable':
                    return {
                        in: 'path',
                        name: this.extractParamName(annotation, paramName),
                        required: true,
                        type: paramType,
                    };

                case 'RequestParam':
                    return {
                        in: 'query',
                        name: this.extractParamName(annotation, paramName),
                        required: this.extractRequired(annotation),
                        type: paramType,
                        defaultValue: this.extractDefaultValue(annotation),
                    };

                case 'RequestBody':
                    return {
                        in: 'body',
                        type: paramType,
                        required: !annotation.raw.includes('required = false'),
                    };

                case 'RequestHeader':
                    return {
                        in: 'header',
                        name: this.extractParamName(annotation, paramName),
                        required: this.extractRequired(annotation),
                        type: paramType,
                    };
            }
        }

        return null;
    }

    extractParamName(annotation, defaultName) {
        if (!annotation.raw) return defaultName;

        const valueMatch = annotation.raw.match(/value\s*=\s*"([^"]+)"/);
        if (valueMatch) return valueMatch[1];

        const nameMatch = annotation.raw.match(/name\s*=\s*"([^"]+)"/);
        if (nameMatch) return nameMatch[1];

        const stringMatch = annotation.raw.match(/@\w+\("([^"]+)"\)/);
        if (stringMatch) return stringMatch[1];

        return defaultName;
    }

    extractRequired(annotation) {
        if (!annotation.raw) return true;

        const requiredMatch = annotation.raw.match(/required\s*=\s*(true|false)/);
        if (requiredMatch) {
            return requiredMatch[1] === 'true';
        }

        return true;
    }

    extractDefaultValue(annotation) {
        if (!annotation.raw) return undefined;

        const defaultMatch = annotation.raw.match(/defaultValue\s*=\s*"([^"]+)"/);
        if (defaultMatch) {
            return defaultMatch[1];
        }

        return undefined;
    }

    producesJson(methodAnnotations) {
        for (const annotation of methodAnnotations) {
            if (annotation.raw && annotation.raw.includes('application/json')) {
                return true;
            }
        }
        return true;
    }

    consumesJson(methodAnnotations) {
        for (const annotation of methodAnnotations) {
            if (annotation.raw && annotation.raw.includes('application/json')) {
                return true;
            }
        }
        return true;
    }
}

module.exports = AnnotationExtractor;
