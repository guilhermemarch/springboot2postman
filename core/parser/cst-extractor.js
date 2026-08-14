/**
 * CST-based extraction of a structured file model from Java source.
 *
 * The file model contains every piece of information the rest of the
 * pipeline needs, extracted from the concrete syntax tree produced by
 * java-parser (no regex over raw annotation text):
 *
 * {
 *   packageName, imports: [{ fqn, simpleName, isStatic, isWildcard }],
 *   constants: { NAME: 'literal value' },
 *   types: [{
 *     kind: 'class'|'interface'|'record'|'enum',
 *     name, simpleName, annotations, typeParameters,
 *     superclass, interfaces, isAbstract,
 *     fields: [{ name, type, annotations, isStatic, isTransient }],
 *     methods: [{ name, returnType, parameters, annotations, javadoc, bodyText, lineNumber }],
 *     enumConstants: ['A', 'B'], lineNumber
 *   }]
 * }
 *
 * Annotations are structured: { name, attributes: { attr: value }, raw }.
 * Attribute values are JS strings/numbers/booleans/arrays, or { ref: text }
 * when the value references something that could not be resolved locally
 * (e.g. a constant from another file or an enum like RequestMethod.POST).
 */

const { normalizeTypeText, splitTopLevel } = require('./java-type');

let parseFn = null;

async function getParseFunction() {
    if (!parseFn) {
        const module = await import('java-parser');
        parseFn = module.parse;
    }
    return parseFn;
}

// ---------------------------------------------------------------------------
// Generic CST helpers
// ---------------------------------------------------------------------------

function findNodes(node, name, results = []) {
    if (!node) {
        return results;
    }

    if (node.name === name) {
        results.push(node);
    }

    if (node.children) {
        for (const children of Object.values(node.children)) {
            if (Array.isArray(children)) {
                children.forEach((child) => findNodes(child, name, results));
            }
        }
    }

    return results;
}

function getNodeText(content, node) {
    if (!node) {
        return '';
    }

    if (node.image !== undefined) {
        return node.image;
    }

    if (
        node.location &&
        node.location.startOffset !== undefined &&
        node.location.endOffset !== undefined
    ) {
        const slice = content.slice(node.location.startOffset, node.location.endOffset + 1);
        if (slice.trim()) {
            return slice;
        }
    }

    if (!node.children) {
        return '';
    }

    const parts = [];
    for (const children of Object.values(node.children)) {
        if (Array.isArray(children)) {
            children.forEach((child) => {
                const text = getNodeText(content, child);
                if (text) {
                    parts.push(text);
                }
            });
        }
    }

    return parts.join(' ');
}

function firstChild(node, name) {
    return node?.children?.[name]?.[0];
}

function childList(node, name) {
    return node?.children?.[name] || [];
}

function hasChild(node, name) {
    return Boolean(node?.children?.[name]);
}

function tokenImage(node) {
    return node?.image || null;
}

// ---------------------------------------------------------------------------
// Annotation attribute values
// ---------------------------------------------------------------------------

/**
 * Well-known Spring constants that appear in annotation attributes.
 * Matched by full text or by last segment (covers static imports).
 */
const WELL_KNOWN_CONSTANTS = {
    'MediaType.APPLICATION_JSON_VALUE': 'application/json',
    'MediaType.APPLICATION_JSON_UTF8_VALUE': 'application/json;charset=UTF-8',
    'MediaType.APPLICATION_XML_VALUE': 'application/xml',
    'MediaType.APPLICATION_PROBLEM_JSON_VALUE': 'application/problem+json',
    'MediaType.APPLICATION_FORM_URLENCODED_VALUE': 'application/x-www-form-urlencoded',
    'MediaType.MULTIPART_FORM_DATA_VALUE': 'multipart/form-data',
    'MediaType.APPLICATION_OCTET_STREAM_VALUE': 'application/octet-stream',
    'MediaType.APPLICATION_PDF_VALUE': 'application/pdf',
    'MediaType.TEXT_PLAIN_VALUE': 'text/plain',
    'MediaType.TEXT_HTML_VALUE': 'text/html',
    'MediaType.TEXT_XML_VALUE': 'text/xml',
    'MediaType.TEXT_EVENT_STREAM_VALUE': 'text/event-stream',
    'MediaType.APPLICATION_NDJSON_VALUE': 'application/x-ndjson',
    'ValueConstants.DEFAULT_NONE': undefined,
};

function unescapeJavaString(quoted) {
    let inner = quoted.slice(1, -1);
    // Java allows \' which JSON does not.
    inner = inner.replace(/\\'/g, "'");
    try {
        return JSON.parse(`"${inner}"`);
    } catch {
        return inner;
    }
}

function resolveConstantText(text, constants) {
    if (!text) {
        return null;
    }

    if (Object.prototype.hasOwnProperty.call(constants, text)) {
        return constants[text];
    }

    const lastSegment = text.split('.').pop();
    if (Object.prototype.hasOwnProperty.call(constants, lastSegment)) {
        return constants[lastSegment];
    }

    if (Object.prototype.hasOwnProperty.call(WELL_KNOWN_CONSTANTS, text)) {
        return WELL_KNOWN_CONSTANTS[text];
    }

    const mediaKey = `MediaType.${lastSegment}`;
    if (Object.prototype.hasOwnProperty.call(WELL_KNOWN_CONSTANTS, mediaKey)) {
        return WELL_KNOWN_CONSTANTS[mediaKey];
    }

    return null;
}

/**
 * Interpret the raw source text of an annotation element value.
 * Returns string | number | boolean | array | { ref } | null.
 */
function interpretElementValueText(text, constants) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
        return null;
    }

    // Array initializer: { "a", "b" }
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return splitTopLevel(trimmed.slice(1, -1), ',')
            .map((part) => interpretElementValueText(part, constants))
            .filter((v) => v !== null && v !== undefined);
    }

    if (trimmed === 'true') {
        return true;
    }
    if (trimmed === 'false') {
        return false;
    }
    if (/^-?\d+$/.test(trimmed)) {
        return parseInt(trimmed, 10);
    }
    if (/^-?\d*\.\d+$/.test(trimmed)) {
        return parseFloat(trimmed);
    }
    // Class literal: SomeType.class
    if (/^[\w.]+\.class$/.test(trimmed)) {
        return { ref: trimmed };
    }

    // String literal, possibly a concatenation of literals and constants.
    const parts = splitTopLevel(trimmed, '+');
    const resolved = parts.map((part) => {
        if (part.startsWith('"') && part.endsWith('"') && part.length >= 2) {
            return unescapeJavaString(part);
        }
        if (/^[\w.]+$/.test(part)) {
            return resolveConstantText(part, constants);
        }
        return null;
    });

    if (resolved.every((p) => typeof p === 'string')) {
        return resolved.join('');
    }

    return { ref: trimmed };
}

function extractAnnotationFromNode(annotationNode, content, constants) {
    const typeNameNode = firstChild(annotationNode, 'typeName');
    const identifiers = childList(typeNameNode, 'Identifier');
    const name = identifiers.length > 0 ? identifiers[identifiers.length - 1].image : null;
    if (!name) {
        return null;
    }

    const attributes = {};

    const pairList = firstChild(annotationNode, 'elementValuePairList');
    if (pairList) {
        for (const pair of childList(pairList, 'elementValuePair')) {
            const attrName = tokenImage(firstChild(pair, 'Identifier'));
            const valueNode = firstChild(pair, 'elementValue');
            if (attrName && valueNode) {
                attributes[attrName] = interpretElementValueText(
                    getNodeText(content, valueNode),
                    constants,
                );
            }
        }
    } else {
        const valueNode = firstChild(annotationNode, 'elementValue');
        if (valueNode) {
            attributes.value = interpretElementValueText(
                getNodeText(content, valueNode),
                constants,
            );
        }
    }

    return {
        name,
        attributes,
        raw: getNodeText(content, annotationNode),
    };
}

/**
 * Extract annotations from an array of modifier nodes
 * (classModifier, methodModifier, fieldModifier, variableModifier, ...).
 */
function extractAnnotations(modifierNodes, content, constants = {}) {
    const annotations = [];

    for (const modifier of modifierNodes || []) {
        for (const annotationNode of childList(modifier, 'annotation')) {
            const annotation = extractAnnotationFromNode(annotationNode, content, constants);
            if (annotation) {
                annotations.push(annotation);
            }
        }
    }

    return annotations;
}

// ---------------------------------------------------------------------------
// Package, imports, constants
// ---------------------------------------------------------------------------

function extractPackageName(content) {
    const match = content.match(/^\s*package\s+([\w.]+)\s*;/m);
    return match ? match[1] : null;
}

function extractImports(content) {
    const imports = [];
    const pattern = /^\s*import\s+(static\s+)?([\w.]+(?:\.\*)?)\s*;/gm;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const isStatic = Boolean(match[1]);
        const target = match[2];
        const isWildcard = target.endsWith('.*');
        const fqn = isWildcard ? target.slice(0, -2) : target;
        imports.push({
            fqn,
            simpleName: isWildcard ? null : fqn.split('.').pop(),
            isStatic,
            isWildcard,
        });
    }
    return imports;
}

/**
 * Collect `static final String NAME = "literal"` constants declared anywhere
 * in the file (classes and interfaces), keyed by field name.
 */
function extractConstantsMap(cst, content) {
    const constants = {};

    const collect = (declNode, requireStaticFinal) => {
        const modifierKey = requireStaticFinal ? 'fieldModifier' : 'constantModifier';
        const modifiers = childList(declNode, modifierKey);
        if (requireStaticFinal) {
            const isStatic = modifiers.some((m) => hasChild(m, 'Static'));
            const isFinal = modifiers.some((m) => hasChild(m, 'Final'));
            if (!isStatic || !isFinal) {
                return;
            }
        }

        const declaratorList = firstChild(declNode, 'variableDeclaratorList');
        for (const declarator of childList(declaratorList, 'variableDeclarator')) {
            const id = firstChild(declarator, 'variableDeclaratorId');
            const name = tokenImage(firstChild(id, 'Identifier'));
            const initializer = firstChild(declarator, 'variableInitializer');
            if (!name || !initializer) {
                continue;
            }
            const text = getNodeText(content, initializer).trim();
            if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
                constants[name] = unescapeJavaString(text);
            }
        }
    };

    for (const field of findNodes(cst, 'fieldDeclaration')) {
        collect(field, true);
    }
    for (const constant of findNodes(cst, 'constantDeclaration')) {
        collect(constant, false);
    }

    return constants;
}

// ---------------------------------------------------------------------------
// Javadoc
// ---------------------------------------------------------------------------

function extractJavadoc(content, startOffset) {
    if (startOffset === undefined || startOffset === null) {
        return null;
    }

    const prefix = content.slice(0, startOffset);
    const idx = prefix.lastIndexOf('/**');
    if (idx === -1) {
        return null;
    }

    const candidate = prefix.slice(idx);
    const match = candidate.match(/^\/\*\*([\s\S]*?)\*\/\s*$/);
    if (!match) {
        return null;
    }

    const lines = match[1].split('\n').map((line) => line.replace(/^\s*\*\s?/, '').trimEnd());

    const descriptionLines = [];
    const params = {};
    let returns = null;
    let deprecated = false;
    let currentTag = null;
    let currentParamName = null;
    let currentBuffer = [];

    const flushTag = () => {
        const text = currentBuffer.join(' ').trim();
        if (currentTag === 'param' && currentParamName) {
            params[currentParamName] = text;
        } else if (currentTag === 'return') {
            returns = text;
        } else if (currentTag === 'deprecated') {
            deprecated = true;
        }
        currentTag = null;
        currentParamName = null;
        currentBuffer = [];
    };

    for (const line of lines) {
        const tagMatch = line.match(/^@(\w+)\s*(.*)$/);
        if (tagMatch) {
            if (currentTag) {
                flushTag();
            }
            currentTag = tagMatch[1];
            if (currentTag === 'param') {
                const paramMatch = tagMatch[2].match(/^(\S+)\s*(.*)$/);
                currentParamName = paramMatch ? paramMatch[1] : null;
                currentBuffer = paramMatch && paramMatch[2] ? [paramMatch[2]] : [];
            } else {
                currentBuffer = tagMatch[2] ? [tagMatch[2]] : [];
            }
            if (currentTag === 'deprecated') {
                deprecated = true;
            }
        } else if (currentTag) {
            if (line.trim()) {
                currentBuffer.push(line.trim());
            }
        } else {
            descriptionLines.push(line);
        }
    }
    if (currentTag) {
        flushTag();
    }

    const description = descriptionLines.join('\n').trim();
    const summary = description.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();

    if (!description && Object.keys(params).length === 0 && !returns && !deprecated) {
        return null;
    }

    return { summary, description, params, returns, deprecated };
}

// ---------------------------------------------------------------------------
// Methods and fields
// ---------------------------------------------------------------------------

function extractResultType(methodHeader, content) {
    const result = firstChild(methodHeader, 'result');
    if (!result) {
        return 'void';
    }
    if (hasChild(result, 'Void')) {
        return 'void';
    }
    const typeNode = firstChild(result, 'unannType') || firstChild(result, 'type');
    const text = normalizeTypeText(getNodeText(content, typeNode));
    return text || 'void';
}

function extractParameters(methodDeclarator, content, constants) {
    const paramList = firstChild(methodDeclarator, 'formalParameterList');
    if (!paramList) {
        return [];
    }

    const params = [];

    for (const formalParameter of childList(paramList, 'formalParameter')) {
        const regular = firstChild(formalParameter, 'variableParaRegularParameter');
        const arity = firstChild(formalParameter, 'variableArityParameter');
        const node = regular || arity;
        if (!node) {
            continue;
        }

        const annotations = extractAnnotations(
            childList(node, 'variableModifier'),
            content,
            constants,
        );

        let type = normalizeTypeText(getNodeText(content, firstChild(node, 'unannType')));

        let name;
        if (regular) {
            const id = firstChild(regular, 'variableDeclaratorId');
            name = tokenImage(firstChild(id, 'Identifier'));
            if (hasChild(id, 'dims')) {
                type += '[]';
            }
        } else {
            name = tokenImage(firstChild(arity, 'Identifier'));
            type += '[]';
        }

        if (name) {
            params.push({ name, type, annotations });
        }
    }

    return params;
}

function extractMethodFromNode(methodNode, content, constants, modifierKey) {
    const header = firstChild(methodNode, 'methodHeader');
    const declarator = firstChild(header, 'methodDeclarator');
    const name = tokenImage(firstChild(declarator, 'Identifier'));
    if (!name) {
        return null;
    }

    const modifiers = childList(methodNode, modifierKey);
    const annotations = extractAnnotations(modifiers, content, constants);
    const isStatic = modifiers.some((m) => hasChild(m, 'Static'));

    const bodyNode = firstChild(methodNode, 'methodBody');

    return {
        name,
        returnType: extractResultType(header, content),
        parameters: extractParameters(declarator, content, constants),
        annotations,
        isStatic,
        bodyText: bodyNode ? getNodeText(content, bodyNode) : '',
        javadoc: extractJavadoc(content, methodNode.location?.startOffset),
        lineNumber: methodNode.location?.startLine || 0,
    };
}

function extractFieldsFromNode(fieldNode, content, constants, modifierKey) {
    const modifiers = childList(fieldNode, modifierKey);
    const annotations = extractAnnotations(modifiers, content, constants);
    const isStatic =
        modifierKey === 'constantModifier' || modifiers.some((m) => hasChild(m, 'Static'));
    const isTransient = modifiers.some((m) => hasChild(m, 'Transient'));

    const baseType = normalizeTypeText(getNodeText(content, firstChild(fieldNode, 'unannType')));

    const fields = [];
    const declaratorList = firstChild(fieldNode, 'variableDeclaratorList');
    for (const declarator of childList(declaratorList, 'variableDeclarator')) {
        const id = firstChild(declarator, 'variableDeclaratorId');
        const name = tokenImage(firstChild(id, 'Identifier'));
        if (!name) {
            continue;
        }
        const type = hasChild(id, 'dims') ? `${baseType}[]` : baseType;
        fields.push({ name, type, annotations, isStatic, isTransient });
    }

    return fields;
}

function extractRecordComponents(recordDecl, content, constants) {
    const header = firstChild(recordDecl, 'recordHeader');
    const componentList = firstChild(header, 'recordComponentList');

    const fields = [];
    for (const component of childList(componentList, 'recordComponent')) {
        const annotations = extractAnnotations(
            childList(component, 'recordComponentModifier'),
            content,
            constants,
        );

        let type = normalizeTypeText(getNodeText(content, firstChild(component, 'unannType')));

        let name = tokenImage(firstChild(component, 'Identifier'));
        const arity = firstChild(component, 'variableArityRecordComponent');
        if (!name && arity) {
            name = tokenImage(firstChild(arity, 'Identifier'));
            type += '[]';
        }

        if (name) {
            fields.push({ name, type, annotations, isStatic: false, isTransient: false });
        }
    }

    return fields;
}

function extractTypeParameterNames(node) {
    const typeParams = firstChild(node, 'typeParameters');
    if (!typeParams) {
        return [];
    }
    const names = [];
    for (const param of findNodes(typeParams, 'typeParameter')) {
        const id = firstChild(param, 'typeIdentifier');
        const name = tokenImage(firstChild(id, 'Identifier'));
        if (name) {
            names.push(name);
        }
    }
    return names;
}

function extractSuperclass(normalClassDecl, content) {
    const ext = firstChild(normalClassDecl, 'classExtends');
    if (!ext) {
        return null;
    }
    const text = normalizeTypeText(getNodeText(content, firstChild(ext, 'classType')));
    return text || null;
}

function extractImplementedInterfaces(node, content, childName) {
    const impl = firstChild(node, childName);
    if (!impl) {
        return [];
    }
    const list = firstChild(impl, 'interfaceTypeList');
    return childList(list, 'interfaceType')
        .map((iface) => normalizeTypeText(getNodeText(content, iface)))
        .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

function makeType(kind, simpleName, outerName) {
    return {
        kind,
        name: outerName ? `${outerName}.${simpleName}` : simpleName,
        simpleName,
        annotations: [],
        typeParameters: [],
        superclass: null,
        interfaces: [],
        isAbstract: false,
        fields: [],
        methods: [],
        enumConstants: [],
        lineNumber: 0,
    };
}

function walkClassBody(bodyNode, content, constants, types, type, outerNameForNested) {
    for (const declaration of childList(bodyNode, 'classBodyDeclaration')) {
        const member = firstChild(declaration, 'classMemberDeclaration');
        if (!member) {
            continue;
        }

        const fieldDecl = firstChild(member, 'fieldDeclaration');
        if (fieldDecl) {
            type.fields.push(
                ...extractFieldsFromNode(fieldDecl, content, constants, 'fieldModifier'),
            );
            continue;
        }

        const methodDecl = firstChild(member, 'methodDeclaration');
        if (methodDecl) {
            const method = extractMethodFromNode(methodDecl, content, constants, 'methodModifier');
            if (method) {
                type.methods.push(method);
            }
            continue;
        }

        const nestedClass = firstChild(member, 'classDeclaration');
        if (nestedClass) {
            collectFromClassDeclaration(nestedClass, content, constants, types, outerNameForNested);
            continue;
        }

        const nestedInterface = firstChild(member, 'interfaceDeclaration');
        if (nestedInterface) {
            collectFromInterfaceDeclaration(
                nestedInterface,
                content,
                constants,
                types,
                outerNameForNested,
            );
        }
    }
}

function collectFromClassDeclaration(classDecl, content, constants, types, outerName) {
    const modifiers = childList(classDecl, 'classModifier');
    const annotations = extractAnnotations(modifiers, content, constants);
    const isAbstract = modifiers.some((m) => hasChild(m, 'Abstract'));

    const normal = firstChild(classDecl, 'normalClassDeclaration');
    const enumDecl = firstChild(classDecl, 'enumDeclaration');
    const recordDecl = firstChild(classDecl, 'recordDeclaration');

    if (normal) {
        const simpleName = tokenImage(
            firstChild(firstChild(normal, 'typeIdentifier'), 'Identifier'),
        );
        if (!simpleName) {
            return;
        }
        const type = makeType('class', simpleName, outerName);
        type.annotations = annotations;
        type.isAbstract = isAbstract;
        type.typeParameters = extractTypeParameterNames(normal);
        type.superclass = extractSuperclass(normal, content);
        type.interfaces = extractImplementedInterfaces(normal, content, 'classImplements');
        type.lineNumber = classDecl.location?.startLine || 0;
        types.push(type);
        walkClassBody(firstChild(normal, 'classBody'), content, constants, types, type, type.name);
        return;
    }

    if (enumDecl) {
        const simpleName = tokenImage(
            firstChild(firstChild(enumDecl, 'typeIdentifier'), 'Identifier'),
        );
        if (!simpleName) {
            return;
        }
        const type = makeType('enum', simpleName, outerName);
        // enumDeclaration may carry its own modifiers in this grammar.
        type.annotations = annotations.concat(
            extractAnnotations(childList(enumDecl, 'classModifier'), content, constants),
        );
        type.interfaces = extractImplementedInterfaces(enumDecl, content, 'classImplements');
        type.lineNumber = classDecl.location?.startLine || 0;

        const body = firstChild(enumDecl, 'enumBody');
        const constantList = firstChild(body, 'enumConstantList');
        for (const constant of childList(constantList, 'enumConstant')) {
            const name = tokenImage(firstChild(constant, 'Identifier'));
            if (name) {
                type.enumConstants.push(name);
            }
        }

        const bodyDeclarations = firstChild(body, 'enumBodyDeclarations');
        if (bodyDeclarations) {
            walkClassBody(bodyDeclarations, content, constants, types, type, type.name);
        }

        types.push(type);
        return;
    }

    if (recordDecl) {
        const simpleName = tokenImage(
            firstChild(firstChild(recordDecl, 'typeIdentifier'), 'Identifier'),
        );
        if (!simpleName) {
            return;
        }
        const type = makeType('record', simpleName, outerName);
        type.annotations = annotations;
        type.typeParameters = extractTypeParameterNames(recordDecl);
        type.interfaces = extractImplementedInterfaces(recordDecl, content, 'classImplements');
        type.fields = extractRecordComponents(recordDecl, content, constants);
        type.lineNumber = classDecl.location?.startLine || 0;
        types.push(type);

        const body = firstChild(recordDecl, 'recordBody');
        for (const declaration of childList(body, 'recordBodyDeclaration')) {
            const classBodyDecl = firstChild(declaration, 'classBodyDeclaration');
            if (!classBodyDecl) {
                continue;
            }
            const member = firstChild(classBodyDecl, 'classMemberDeclaration');
            const methodDecl = firstChild(member, 'methodDeclaration');
            if (methodDecl) {
                const method = extractMethodFromNode(
                    methodDecl,
                    content,
                    constants,
                    'methodModifier',
                );
                if (method) {
                    type.methods.push(method);
                }
            }
        }
    }
}

function collectFromInterfaceDeclaration(interfaceDecl, content, constants, types, outerName) {
    const modifiers = childList(interfaceDecl, 'interfaceModifier');
    const annotations = extractAnnotations(modifiers, content, constants);

    const normal = firstChild(interfaceDecl, 'normalInterfaceDeclaration');
    if (!normal) {
        // Annotation type declarations (@interface) are not relevant.
        return;
    }

    const simpleName = tokenImage(firstChild(firstChild(normal, 'typeIdentifier'), 'Identifier'));
    if (!simpleName) {
        return;
    }

    const type = makeType('interface', simpleName, outerName);
    type.annotations = annotations;
    type.typeParameters = extractTypeParameterNames(normal);

    const ext = firstChild(normal, 'interfaceExtends');
    if (ext) {
        const list = firstChild(ext, 'interfaceTypeList');
        type.interfaces = childList(list, 'interfaceType')
            .map((iface) => normalizeTypeText(getNodeText(content, iface)))
            .filter(Boolean);
    }

    type.lineNumber = interfaceDecl.location?.startLine || 0;
    types.push(type);

    const body = firstChild(normal, 'interfaceBody');
    for (const member of childList(body, 'interfaceMemberDeclaration')) {
        const constantDecl = firstChild(member, 'constantDeclaration');
        if (constantDecl) {
            type.fields.push(
                ...extractFieldsFromNode(constantDecl, content, constants, 'constantModifier'),
            );
            continue;
        }

        const methodDecl = firstChild(member, 'interfaceMethodDeclaration');
        if (methodDecl) {
            const method = extractMethodFromNode(
                methodDecl,
                content,
                constants,
                'interfaceMethodModifier',
            );
            if (method) {
                type.methods.push(method);
            }
            continue;
        }

        const nestedClass = firstChild(member, 'classDeclaration');
        if (nestedClass) {
            collectFromClassDeclaration(nestedClass, content, constants, types, type.name);
            continue;
        }

        const nestedInterface = firstChild(member, 'interfaceDeclaration');
        if (nestedInterface) {
            collectFromInterfaceDeclaration(nestedInterface, content, constants, types, type.name);
        }
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parse Java source content into a structured file model.
 * Throws if java-parser cannot parse the content.
 */
async function parseJavaContent(content) {
    const parse = await getParseFunction();
    const cst = parse(content);

    const constants = extractConstantsMap(cst, content);
    const types = [];

    for (const declaration of findNodes(cst, 'typeDeclaration')) {
        const classDecl = firstChild(declaration, 'classDeclaration');
        if (classDecl) {
            collectFromClassDeclaration(classDecl, content, constants, types, null);
            continue;
        }
        const interfaceDecl = firstChild(declaration, 'interfaceDeclaration');
        if (interfaceDecl) {
            collectFromInterfaceDeclaration(interfaceDecl, content, constants, types, null);
        }
    }

    return {
        content,
        packageName: extractPackageName(content),
        imports: extractImports(content),
        constants,
        types,
    };
}

module.exports = {
    parseJavaContent,
    findNodes,
    getNodeText,
    extractAnnotations,
    extractJavadoc,
    interpretElementValueText,
};
