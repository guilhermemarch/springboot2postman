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

    extractEndpointInfos(methodAnnotations) {
        const mappingAnnotations = [
            'GetMapping',
            'PostMapping',
            'PutMapping',
            'DeleteMapping',
            'PatchMapping',
            'RequestMapping',
        ];

        for (const annotation of methodAnnotations) {
            if (!mappingAnnotations.includes(annotation.name)) {
                continue;
            }

            const path = this.extractValueFromAnnotation(annotation);
            const methods = this.getHttpMethods(annotation.name, annotation.value);

            return methods.map((method) => ({
                method,
                path,
                annotation: annotation.name,
            }));
        }

        return [];
    }

    getHttpMethods(annotationName, annotationValue) {
        if (annotationName === 'RequestMapping') {
            const explicitMethods = this.parseRequestMappingMethods(annotationValue);
            if (explicitMethods.length > 0) {
                return explicitMethods;
            }
            return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        }

        return [this.getHttpMethod(annotationName)];
    }

    getHttpMethod(annotationName) {
        const mapping = {
            GetMapping: 'GET',
            PostMapping: 'POST',
            PutMapping: 'PUT',
            DeleteMapping: 'DELETE',
            PatchMapping: 'PATCH',
        };

        return mapping[annotationName] || 'GET';
    }

    parseRequestMappingMethods(annotationValue) {
        if (!annotationValue) {
            return [];
        }

        const methods = new Set();
        const matches = annotationValue.matchAll(/RequestMethod\.(\w+)/g);
        for (const match of matches) {
            methods.add(match[1].toUpperCase());
        }

        return [...methods];
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

    extractParameterInfos(paramAnnotations, paramName, paramType) {
        for (const annotation of paramAnnotations) {
            const info = this.extractParameterInfo(annotation, paramName, paramType);
            if (info) {
                return [info];
            }
        }

        if (this.isPageableType(paramType)) {
            return this.createPageableParameters();
        }

        return [];
    }

    extractParameterInfo(annotation, paramName, paramType) {
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

            case 'ModelAttribute':
                return {
                    in: 'query',
                    name: this.extractParamName(annotation, paramName),
                    required: false,
                    type: paramType,
                };

            default:
                return null;
        }
    }

    isPageableType(paramType) {
        return paramType === 'Pageable' || paramType.endsWith('.Pageable');
    }

    createPageableParameters() {
        return [
            { in: 'query', name: 'page', required: false, type: 'Integer', defaultValue: '0' },
            { in: 'query', name: 'size', required: false, type: 'Integer', defaultValue: '20' },
            { in: 'query', name: 'sort', required: false, type: 'String' },
        ];
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
}

module.exports = AnnotationExtractor;
