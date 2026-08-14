/**
 * Collects everything the run could and could not resolve, so the user gets
 * an honest account of the generated output instead of silent guesses.
 */
class RunReport {
    constructor() {
        this.strategy = null;
        this.controllersScanned = 0;
        this.controllerTypes = 0;
        this.endpoints = 0;
        this.schemaCount = 0;
        this.skippedFiles = [];
        this.unresolvedTypes = [];
        this.collisions = [];
        this.warnings = [];
    }

    addWarning(message) {
        if (!this.warnings.includes(message)) {
            this.warnings.push(message);
        }
    }

    addCollision(method, path, detail) {
        this.collisions.push({ method, path, detail });
    }

    setSkippedFiles(files) {
        this.skippedFiles = files || [];
    }

    setUnresolvedTypes(types) {
        this.unresolvedTypes = types || [];
    }

    hasIssues() {
        return (
            this.skippedFiles.length > 0 ||
            this.unresolvedTypes.length > 0 ||
            this.collisions.length > 0 ||
            this.warnings.length > 0
        );
    }

    issueCount() {
        return (
            this.skippedFiles.length +
            this.unresolvedTypes.length +
            this.collisions.length +
            this.warnings.length
        );
    }

    /**
     * Human-readable summary lines: [{ level: 'info'|'warn', text }].
     */
    toLines() {
        const lines = [];

        lines.push({ level: 'info', text: `Endpoints: ${this.endpoints}` });
        if (this.schemaCount > 0) {
            lines.push({ level: 'info', text: `Schemas: ${this.schemaCount}` });
        }

        for (const { file, reason } of this.skippedFiles) {
            lines.push({ level: 'warn', text: `Skipped file: ${file} (${reason})` });
        }

        for (const { name, reason, locations } of this.unresolvedTypes) {
            const where =
                locations.length > 0 ? ` — used at ${locations.slice(0, 3).join(', ')}` : '';
            const more = locations.length > 3 ? ` and ${locations.length - 3} more` : '';
            lines.push({
                level: 'warn',
                text: `Unresolved type: ${name} (${reason})${where}${more}`,
            });
        }

        for (const { method, path, detail } of this.collisions) {
            lines.push({
                level: 'warn',
                text:
                    `Duplicate mapping ${method.toUpperCase()} ${path} — ` +
                    `kept first, skipped ${detail}`,
            });
        }

        for (const warning of this.warnings) {
            lines.push({ level: 'warn', text: warning });
        }

        return lines;
    }

    toJSON() {
        return {
            strategy: this.strategy,
            controllersScanned: this.controllersScanned,
            controllerTypes: this.controllerTypes,
            endpoints: this.endpoints,
            schemas: this.schemaCount,
            skippedFiles: this.skippedFiles,
            unresolvedTypes: this.unresolvedTypes,
            collisions: this.collisions,
            warnings: this.warnings,
        };
    }
}

module.exports = RunReport;
