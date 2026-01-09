const { glob } = require('glob');
const { readFile, isDirectory, pathExists } = require('../../lib/file-utils');
const { ProjectNotFoundError, NoControllersFoundError } = require('../../lib/errors');

class ControllerScanner {
    constructor(logger) {
        this.logger = logger;
    }

    async findControllers(projectPath, options = {}) {
        this.logger.debug(`Scanning for controllers in: ${projectPath}`);

        if (!(await pathExists(projectPath))) {
            throw new ProjectNotFoundError(projectPath);
        }

        if (!(await isDirectory(projectPath))) {
            throw new ProjectNotFoundError(`${projectPath} is not a directory`);
        }

        const patterns = [
            `${projectPath}/src/main/java/**/*Controller.java`,
            `${projectPath}/src/main/java/**/*RestController.java`,
            `${projectPath}/src/**/*.java`,
        ];

        let javaFiles = [];
        for (const pattern of patterns) {
            this.logger.debug(`Searching pattern: ${pattern}`);
            const files = await glob(pattern, { nodir: true });
            javaFiles.push(...files);

            if (files.length > 0) {
                this.logger.debug(`Found ${files.length} files with pattern`);
                break;
            }
        }

        javaFiles = [...new Set(javaFiles)];

        if (javaFiles.length === 0) {
            throw new NoControllersFoundError(projectPath);
        }

        javaFiles = this.applyFilters(javaFiles, options);

        this.logger.debug(`Found ${javaFiles.length} Java files after filtering, checking for controllers...`);

        const controllers = [];
        for (const file of javaFiles) {
            if (await this.isController(file)) {
                controllers.push(file);
                this.logger.debug(`✓ Controller: ${file}`);
            }
        }

        if (controllers.length === 0) {
            throw new NoControllersFoundError(projectPath);
        }

        this.logger.info(`Found ${controllers.length} controller(s)`);
        return controllers;
    }

    applyFilters(files, options) {
        let filtered = files;

        if (options.include) {
            const includePatterns = options.include.split(',').map(p => p.trim());
            filtered = filtered.filter(file => {
                return includePatterns.some(pattern => this.matchesPattern(file, pattern));
            });
            this.logger.debug(`Include filter applied: ${filtered.length} files remaining`);
        }

        if (options.exclude) {
            const excludePatterns = options.exclude.split(',').map(p => p.trim());
            filtered = filtered.filter(file => {
                return !excludePatterns.some(pattern => this.matchesPattern(file, pattern));
            });
            this.logger.debug(`Exclude filter applied: ${filtered.length} files remaining`);
        }

        return filtered;
    }

    matchesPattern(filepath, pattern) {
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '{{DOUBLE_STAR}}')
            .replace(/\*/g, '[^/]*')
            .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');

        const regex = new RegExp(regexPattern);
        return regex.test(filepath);
    }

    async isController(filepath) {
        try {
            const content = await readFile(filepath);

            const hasRestController = content.includes('@RestController');
            const hasController = content.includes('@Controller');
            const hasResponseBody = content.includes('@ResponseBody');
            const hasRequestMapping = content.includes('@RequestMapping');

            return hasRestController || (hasController && (hasResponseBody || hasRequestMapping));
        } catch (error) {
            this.logger.debug(`Failed to read ${filepath}: ${error.message}`);
            return false;
        }
    }

    async getControllerInfo(filepath) {
        const content = await readFile(filepath);
        const lines = content.split('\n');

        const classMatch = content.match(/class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'Unknown';

        return {
            filepath,
            className,
            lineCount: lines.length,
        };
    }
}

module.exports = ControllerScanner;
