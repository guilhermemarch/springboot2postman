const path = require('path');
const { glob } = require('glob');
const { readFile, pathExists, isDirectory } = require('../../lib/file-utils');
const { parseJavaContent } = require('./cst-extractor');

const BUILD_DIR_IGNORES = [
    '**/node_modules/**',
    '**/target/**',
    '**/build/**',
    '**/out/**',
    '**/.git/**',
    '**/.gradle/**',
    '**/.mvn/**',
    '**/bin/**',
];

/**
 * Lazy, project-wide index of Java types.
 *
 * Instead of guessing DTOs by filename convention, the index maps every main
 * source file (across all Maven/Gradle modules) by basename and resolves type
 * names on demand following Java rules: explicit import, same package,
 * wildcard import, unique basename. Files are parsed at most once, only when
 * something references them.
 */
class SourceIndex {
    constructor(logger) {
        this.logger = logger;
        this.fileList = [];
        this.byBasename = new Map();
        this.fileModels = new Map();
        this.failedFiles = new Map();
        this.usedFallbackLayout = false;
    }

    async build(projectPath) {
        if (!(await pathExists(projectPath)) || !(await isDirectory(projectPath))) {
            return this;
        }

        const mainPattern = '**/src/main/java/**/*.java';
        let files = await glob(mainPattern, {
            cwd: projectPath,
            nodir: true,
            absolute: true,
            ignore: BUILD_DIR_IGNORES,
            windowsPathsNoEscape: true,
        });

        if (files.length === 0) {
            // Unconventional layout: index every .java file except tests.
            this.usedFallbackLayout = true;
            files = await glob('**/*.java', {
                cwd: projectPath,
                nodir: true,
                absolute: true,
                ignore: [...BUILD_DIR_IGNORES, '**/src/test/**', '**/test/**', '**/tests/**'],
                windowsPathsNoEscape: true,
            });
        }

        this.fileList = files.sort();

        for (const file of this.fileList) {
            const base = path.basename(file, '.java');
            if (!this.byBasename.has(base)) {
                this.byBasename.set(base, []);
            }
            this.byBasename.get(base).push(file);
        }

        this.logger.debug(`Source index: ${this.fileList.length} Java file(s)`);
        return this;
    }

    /**
     * Parse (and cache) the structured model for one file.
     * Returns null when the file cannot be parsed; the failure is recorded.
     */
    async getFileModel(filePath) {
        if (this.fileModels.has(filePath)) {
            return this.fileModels.get(filePath);
        }
        if (this.failedFiles.has(filePath)) {
            return null;
        }

        try {
            const content = await readFile(filePath);
            const model = await parseJavaContent(content);
            model.filePath = filePath;
            this.fileModels.set(filePath, model);
            return model;
        } catch (error) {
            const reason = error.message ? error.message.split('\n')[0] : 'parse error';
            this.failedFiles.set(filePath, reason);
            this.logger.debug(`Failed to parse ${filePath}: ${reason}`);
            return null;
        }
    }

    /**
     * Resolve a type name to { type, model } following Java resolution rules.
     *
     * @param {string} name simple ('OrderResponse'), qualified
     *   ('com.shop.orders.dto.OrderResponse') or nested ('Outer.Inner').
     * @param {object|null} context file model of the referencing file.
     */
    async resolveType(name, context) {
        if (!name) {
            return null;
        }

        // Same-file types (including nested Outer.Inner names).
        if (context) {
            const local = this.findTypeInModel(context, name);
            if (local) {
                return { type: local, model: context };
            }
        }

        if (name.includes('.')) {
            return this.resolveQualified(name);
        }

        // 1. Explicit import.
        if (context) {
            const explicit = (context.imports || []).find(
                (imp) => !imp.isStatic && imp.simpleName === name,
            );
            if (explicit) {
                const resolved = await this.resolveQualified(explicit.fqn);
                if (resolved) {
                    return resolved;
                }
            }

            // 2. Same package (same directory in practice).
            const sameDir = (this.byBasename.get(name) || []).find(
                (file) => path.dirname(file) === path.dirname(context.filePath || ''),
            );
            if (sameDir) {
                const resolved = await this.typeFromFile(sameDir, name);
                if (resolved) {
                    return resolved;
                }
            }

            // 3. Wildcard imports.
            for (const imp of (context.imports || []).filter((i) => i.isWildcard && !i.isStatic)) {
                const resolved = await this.resolveQualified(`${imp.fqn}.${name}`);
                if (resolved) {
                    return resolved;
                }
            }
        }

        // 4. Unique basename match anywhere in the project.
        const candidates = this.byBasename.get(name) || [];
        if (candidates.length === 1) {
            return this.typeFromFile(candidates[0], name);
        }
        if (candidates.length > 1 && context?.packageName) {
            // Prefer a candidate sharing the longest package prefix.
            const scored = [...candidates].sort(
                (a, b) =>
                    this.sharedPrefixLength(b, context.packageName) -
                    this.sharedPrefixLength(a, context.packageName),
            );
            return this.typeFromFile(scored[0], name);
        }

        return null;
    }

    sharedPrefixLength(filePath, packageName) {
        const normalized = filePath.split(path.sep).join('/');
        const segments = packageName.split('.');
        let best = 0;
        for (let i = segments.length; i > 0; i--) {
            if (normalized.includes(`/${segments.slice(0, i).join('/')}/`)) {
                best = i;
                break;
            }
        }
        return best;
    }

    async resolveQualified(qualifiedName) {
        const segments = qualifiedName.split('.');

        // Try progressively shorter tails as the type chain: a.b.Outer.Inner
        for (let i = segments.length - 1; i >= 0; i--) {
            const basename = segments[i];
            if (!/^[A-Z]/.test(basename)) {
                continue;
            }
            const candidates = this.byBasename.get(basename) || [];
            for (const file of candidates) {
                if (!this.fileMatchesPackage(file, segments.slice(0, i))) {
                    continue;
                }
                const typeName = segments.slice(i).join('.');
                const resolved = await this.typeFromFile(file, typeName);
                if (resolved) {
                    return resolved;
                }
            }
        }

        return null;
    }

    fileMatchesPackage(filePath, packageSegments) {
        if (packageSegments.length === 0) {
            return true;
        }
        const dir = path.dirname(filePath).split(path.sep).join('/');
        return dir.endsWith(packageSegments.join('/'));
    }

    async typeFromFile(filePath, typeName) {
        const model = await this.getFileModel(filePath);
        if (!model) {
            return null;
        }
        const type = this.findTypeInModel(model, typeName);
        return type ? { type, model } : null;
    }

    findTypeInModel(model, typeName) {
        if (!model?.types) {
            return null;
        }
        return (
            model.types.find((t) => t.name === typeName) ||
            model.types.find((t) => t.simpleName === typeName) ||
            null
        );
    }

    /**
     * Resolve a constant reference such as `ApiPaths.ORDERS` or `BASE_PATH`
     * (via static imports) to its string literal value, looking beyond the
     * current file.
     */
    async resolveConstant(ref, context) {
        if (!ref || !context) {
            return null;
        }

        const segments = ref.split('.');
        const constantName = segments[segments.length - 1];

        if (segments.length === 1) {
            // Static imports: import static com.x.ApiPaths.ORDERS; or .*
            for (const imp of (context.imports || []).filter((i) => i.isStatic)) {
                const targetFqn = imp.isWildcard
                    ? imp.fqn
                    : imp.simpleName === constantName
                      ? imp.fqn.split('.').slice(0, -1).join('.')
                      : null;
                if (!targetFqn) {
                    continue;
                }
                const resolved = await this.resolveQualified(targetFqn);
                if (resolved?.model?.constants?.[constantName] !== undefined) {
                    return resolved.model.constants[constantName];
                }
            }
            return null;
        }

        const ownerRef = segments.slice(0, -1).join('.');
        const resolved = await this.resolveType(ownerRef, context);
        if (resolved?.model?.constants?.[constantName] !== undefined) {
            return resolved.model.constants[constantName];
        }

        return null;
    }

    /**
     * Collect fields for a type including inherited ones (superclass chain),
     * parents first so subclasses can shadow. Each field carries
     * `declaringModel` so its type can be resolved with the right imports.
     */
    async collectFields(typeEntry, seen = new Set()) {
        const { type, model } = typeEntry;
        const key = `${model.filePath}#${type.name}`;
        if (seen.has(key)) {
            return [];
        }
        seen.add(key);

        let inherited = [];
        if (type.superclass) {
            const baseName = type.superclass.split('<')[0];
            const parent = await this.resolveType(baseName, model);
            if (parent) {
                inherited = await this.collectFields(parent, seen);
            }
        }

        const own = type.fields.map((field) => ({ ...field, declaringModel: model }));
        const ownNames = new Set(own.map((f) => f.name));
        return [...inherited.filter((f) => !ownNames.has(f.name)), ...own];
    }

    getFailedFiles() {
        return [...this.failedFiles.entries()].map(([file, reason]) => ({ file, reason }));
    }
}

module.exports = SourceIndex;
