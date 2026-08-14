/**
 * Structured parsing of Java type expressions with balanced generics.
 *
 * A parsed type has the shape:
 *   { name: 'List', qualified: 'java.util.List', args: [ ...parsed types ], arrayDims: 0 }
 *
 * `name` is always the simple name (last dot segment). `qualified` keeps the
 * full text as written in source (without generics), which callers can use
 * for import-based resolution.
 */

/**
 * Normalize whitespace in a type expression: collapse runs of whitespace and
 * remove spaces around punctuation while preserving the single space needed
 * by wildcard bounds ("? extends Foo").
 */
function normalizeTypeText(text) {
    if (!text) {
        return '';
    }
    return text
        .replace(/\s+/g, ' ')
        .replace(/\s*([<>,[\].])\s*/g, '$1')
        .trim();
}

/**
 * Split a string on a single-character separator at nesting depth zero.
 * Tracks (), {}, <> and [] nesting plus double-quoted strings with escapes.
 */
function splitTopLevel(text, separator) {
    const parts = [];
    let depth = 0;
    let inString = false;
    let current = '';

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inString) {
            current += ch;
            if (ch === '\\') {
                current += text[i + 1] || '';
                i++;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            current += ch;
            continue;
        }

        if (ch === '(' || ch === '{' || ch === '<' || ch === '[') {
            depth++;
        } else if (ch === ')' || ch === '}' || ch === '>' || ch === ']') {
            depth--;
        }

        if (ch === separator && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.trim() !== '' || parts.length > 0) {
        parts.push(current);
    }

    return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/**
 * Parse a Java type expression into a structured tree.
 * Returns null for empty input.
 */
function parseJavaType(text) {
    let normalized = normalizeTypeText(text);
    if (!normalized) {
        return null;
    }

    // Varargs behave like an array parameter.
    if (normalized.endsWith('...')) {
        normalized = normalized.slice(0, -3);
        const inner = parseJavaType(normalized);
        if (inner) {
            inner.arrayDims += 1;
        }
        return inner;
    }

    // Wildcards: "?", "? extends Foo", "? super Foo"
    if (normalized.startsWith('?')) {
        const boundMatch = normalized.match(/^\?\s*(?:extends|super)\s+(.+)$/);
        if (boundMatch) {
            return parseJavaType(boundMatch[1]);
        }
        return { name: 'Object', qualified: 'Object', args: [], arrayDims: 0 };
    }

    // Trailing array dimensions.
    let arrayDims = 0;
    while (normalized.endsWith('[]')) {
        arrayDims++;
        normalized = normalized.slice(0, -2);
    }

    // Split base name from type arguments.
    const lt = normalized.indexOf('<');
    let base = normalized;
    let args = [];

    if (lt !== -1) {
        if (!normalized.endsWith('>')) {
            // Malformed generics; treat the whole text as an opaque name.
            base = normalized;
        } else {
            base = normalized.slice(0, lt);
            const argText = normalized.slice(lt + 1, -1);
            args = splitTopLevel(argText, ',')
                .map((part) => parseJavaType(part))
                .filter(Boolean);
        }
    }

    const segments = base.split('.');
    const name = segments[segments.length - 1] || base;

    return {
        name,
        qualified: base,
        args,
        arrayDims,
    };
}

/**
 * Render a parsed type back to canonical text (simple names only).
 */
function typeToString(type) {
    if (!type) {
        return '';
    }
    let text = type.name;
    if (type.args.length > 0) {
        text += `<${type.args.map(typeToString).join(',')}>`;
    }
    text += '[]'.repeat(type.arrayDims);
    return text;
}

/**
 * Substitute type variables using a mapping of variable name to parsed type.
 * Used to resolve inherited generic signatures, e.g. for
 * `class AdminOrderController extends CrudController<OrderResponse, Long>`
 * the base method `ResponseEntity<T> findById(ID id)` resolves with
 * { T: OrderResponse, ID: Long }.
 */
function substituteTypeVariables(type, mapping) {
    if (!type) {
        return type;
    }

    if (type.args.length === 0 && mapping[type.name]) {
        const replacement = mapping[type.name];
        return {
            name: replacement.name,
            qualified: replacement.qualified,
            args: replacement.args.map((a) => substituteTypeVariables(a, mapping)),
            arrayDims: replacement.arrayDims + type.arrayDims,
        };
    }

    return {
        name: type.name,
        qualified: type.qualified,
        args: type.args.map((a) => substituteTypeVariables(a, mapping)),
        arrayDims: type.arrayDims,
    };
}

/**
 * Substitute type variables in a type expression given as text.
 */
function substituteInText(typeText, mapping) {
    if (!typeText || Object.keys(mapping).length === 0) {
        return typeText;
    }
    const parsed = parseJavaType(typeText);
    if (!parsed) {
        return typeText;
    }
    return typeToString(substituteTypeVariables(parsed, mapping));
}

module.exports = {
    normalizeTypeText,
    splitTopLevel,
    parseJavaType,
    typeToString,
    substituteTypeVariables,
    substituteInText,
};
