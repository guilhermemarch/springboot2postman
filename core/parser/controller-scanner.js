const { readFile } = require('../../lib/file-utils');
const { NoControllersFoundError } = require('../../lib/errors');

/**
 * Word-boundary matching: '@RestControllerAdvice' must NOT match, and
 * imports (no leading '@') are never confused with usage.
 */
const CONTROLLER_PATTERN = /@(RestController|Controller)\b/;

class ControllerScanner {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Find controller candidate files from an already-built SourceIndex
     * (which only lists main sources, across all modules).
     *
     * @param {import('./source-index')} sourceIndex
     * @param {object} options { include, exclude } comma-separated globs
     * @returns {Promise<string[]>} absolute file paths
     */
    async findControllers(sourceIndex, options = {}) {
        let files = this.applyFilters(sourceIndex.fileList, options);

        this.logger.debug(`Scanning ${files.length} Java file(s) for controllers...`);

        const controllers = [];
        for (const file of files) {
            try {
                const content = await readFile(file);
                if (CONTROLLER_PATTERN.test(content)) {
                    controllers.push(file);
                    this.logger.debug(`Controller candidate: ${file}`);
                }
            } catch (error) {
                this.logger.debug(`Failed to read ${file}: ${error.message}`);
            }
        }

        if (controllers.length === 0) {
            throw new NoControllersFoundError(
                options.include || options.exclude
                    ? 'no controllers matched the include/exclude filters'
                    : undefined,
            );
        }

        return controllers;
    }

    applyFilters(files, options) {
        let filtered = files;

        if (options.include) {
            const patterns = options.include.split(',').map((p) => p.trim()).filter(Boolean);
            filtered = filtered.filter((file) =>
                patterns.some((pattern) => this.matchesPattern(file, pattern)),
            );
            this.logger.debug(`Include filter: ${filtered.length} file(s) remaining`);
        }

        if (options.exclude) {
            const patterns = options.exclude.split(',').map((p) => p.trim()).filter(Boolean);
            filtered = filtered.filter(
                (file) => !patterns.some((pattern) => this.matchesPattern(file, pattern)),
            );
            this.logger.debug(`Exclude filter: ${filtered.length} file(s) remaining`);
        }

        return filtered;
    }

    /**
     * Glob-ish matching against the normalized (forward-slash) file path.
     * All regex metacharacters are escaped so user input cannot break or
     * inject into the pattern.
     */
    matchesPattern(filepath, pattern) {
        const normalized = filepath.split('\\').join('/');
        const escaped = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '\u0000')
            .replace(/\*/g, '[^/]*')
            .replace(/\u0000/g, '.*');

        try {
            return new RegExp(escaped).test(normalized);
        } catch {
            return false;
        }
    }
}

module.exports = ControllerScanner;
