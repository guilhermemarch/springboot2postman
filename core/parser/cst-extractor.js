let parseFn = null;

async function getParseFunction() {
    if (!parseFn) {
        const module = await import('java-parser');
        parseFn = module.parse;
    }
    return parseFn;
}

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

function getIdentifier(node) {
    if (!node) {
        return null;
    }

    if (node.image) {
        return node.image;
    }

    if (node.children?.Identifier) {
        return node.children.Identifier[0]?.image || null;
    }

    if (node.children?.typeIdentifier) {
        return getIdentifier(node.children.typeIdentifier[0]);
    }

    if (node.children?.unannClassType) {
        return getTypeText(node.children.unannClassType[0]);
    }

    if (node.children?.classType) {
        const parts = [];
        collectTypeParts(node.children.classType[0], parts);
        return parts.join('.');
    }

    if (node.children?.unannClassOrInterfaceType) {
        const parts = [];
        collectTypeParts(node.children.unannClassOrInterfaceType[0], parts);
        return parts.join('.') || getTypeText(node.children.unannClassOrInterfaceType[0]);
    }

    if (node.children?.classOrInterfaceType) {
        return getTypeText(node.children.classOrInterfaceType[0]);
    }

    return null;
}

function collectTypeParts(node, parts) {
    if (!node?.children) {
        return;
    }

    if (node.children.Identifier) {
        let name = node.children.Identifier[0].image;
        if (node.children.typeArguments) {
            const inner = getTypeArgumentsText(node.children.typeArguments[0]);
            if (inner) {
                name = `${name}<${inner}>`;
            }
        }
        parts.push(name);
    }

    if (node.children.unannClassType) {
        node.children.unannClassType.forEach((child) => collectTypeParts(child, parts));
    }
}

function getTypeArgumentsText(node) {
    if (!node?.children?.typeArgumentList) {
        return '';
    }

    const args = node.children.typeArgumentList[0]?.children?.typeArgument || [];
    return args
        .map((arg) => getTypeText(arg))
        .filter(Boolean)
        .join(', ');
}

function getTypeText(node) {
    if (!node) {
        return '';
    }

    if (node.children?.unannType) {
        return getTypeText(node.children.unannType[0]);
    }

    if (node.children?.unannReferenceType) {
        return getTypeText(node.children.unannReferenceType[0]);
    }

    if (node.children?.referenceType) {
        return getTypeText(node.children.referenceType[0]);
    }

    if (node.children?.primitiveType) {
        return node.children.primitiveType[0]?.children
            ? Object.keys(node.children.primitiveType[0].children)[0]
            : 'Object';
    }

    if (node.children?.unannPrimitiveType) {
        return node.children.unannPrimitiveType[0]?.children
            ? Object.keys(node.children.unannPrimitiveType[0].children)[0]
            : 'Object';
    }

    const identifier = getIdentifier(node);
    if (identifier) {
        if (node.children?.typeArguments) {
            const args = getTypeArgumentsText(node.children.typeArguments[0]);
            return args ? `${identifier}<${args}>` : identifier;
        }
        return identifier;
    }

    return 'Object';
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

    return parts.join('');
}

function extractAnnotationValue(annotationNode, content) {
    const elementValue = annotationNode.children?.elementValue?.[0];
    if (!elementValue) {
        return null;
    }

    const text = getNodeText(content, elementValue).trim();
    if (text.startsWith('(') && text.endsWith(')')) {
        return text.slice(1, -1).trim();
    }

    return text;
}

function extractAnnotations(modifierNodes, content) {
    const annotations = [];

    for (const modifier of modifierNodes || []) {
        const annotationNodes = modifier.children?.annotation || [];
        for (const annotationNode of annotationNodes) {
            const name = getIdentifier(annotationNode.children?.typeName?.[0]);
            if (!name) {
                continue;
            }

            annotations.push({
                name,
                value: extractAnnotationValue(annotationNode, content),
                raw: getNodeText(content, annotationNode),
            });
        }
    }

    return annotations;
}

function extractFormalParameters(methodNode, content) {
    const declarator = methodNode.children?.methodHeader?.[0]?.children?.methodDeclarator?.[0];
    if (!declarator?.children?.formalParameterList) {
        return [];
    }

    const params = [];
    const formalParameters =
        declarator.children.formalParameterList[0]?.children?.formalParameter || [];

    for (const formalParameter of formalParameters) {
        const regular =
            formalParameter.children?.variableParaRegularParameter?.[0] ||
            formalParameter.children?.variableArityParameter?.[0];

        if (!regular) {
            continue;
        }

        const annotations = extractAnnotations(regular.children?.variableModifier, content);
        const type = getTypeText(regular.children?.unannType?.[0] || regular.children?.type?.[0]);
        const name = regular.children?.variableDeclaratorId?.[0]?.children?.Identifier?.[0]?.image;

        if (name) {
            params.push({ type, name, annotations });
        }
    }

    return params;
}

function extractMethodReturnType(methodNode) {
    const result = methodNode.children?.methodHeader?.[0]?.children?.result?.[0];
    if (!result) {
        return 'void';
    }

    if (result.children?.unannType) {
        return getTypeText(result.children.unannType[0]);
    }

    if (result.children?.type) {
        return getTypeText(result.children.type[0]);
    }

    return 'void';
}

function extractMethods(content, cst) {
    const methods = [];
    const methodNodes = findNodes(cst, 'methodDeclaration');

    for (const methodNode of methodNodes) {
        const declarator = methodNode.children?.methodHeader?.[0]?.children?.methodDeclarator?.[0];
        const methodName = declarator?.children?.Identifier?.[0]?.image;

        if (!methodName) {
            continue;
        }

        const modifierNodes = methodNode.children?.methodModifier || [];
        const annotations = extractAnnotations(modifierNodes, content);

        methods.push({
            name: methodName,
            returnType: extractMethodReturnType(methodNode),
            parameters: extractFormalParameters(methodNode, content),
            annotations,
            lineNumber: methodNode.location?.startLine || 0,
        });
    }

    return methods;
}

function extractClassInfo(content, cst) {
    const packageMatch = content.match(/package\s+([\w.]+);/);
    const packageName = packageMatch ? packageMatch[1] : null;

    const classNodes = findNodes(cst, 'normalClassDeclaration');
    const classNode = classNodes[0];
    const className =
        classNode?.children?.typeIdentifier?.[0]?.children?.Identifier?.[0]?.image || 'Unknown';

    const classDeclaration = findNodes(cst, 'classDeclaration')[0];
    const classModifiers = classDeclaration?.children?.classModifier || [];
    const annotations = extractAnnotations(classModifiers, content);

    return {
        packageName,
        className,
        annotations,
    };
}

async function parseJavaContent(content) {
    const parse = await getParseFunction();
    const cst = parse(content);
    return {
        content,
        classInfo: extractClassInfo(content, cst),
        methods: extractMethods(content, cst),
    };
}

module.exports = {
    parseJavaContent,
    findNodes,
    extractAnnotations,
    getTypeText,
};
