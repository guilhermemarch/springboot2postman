const path = require('path');
const { glob } = require('glob');
const { isFile, pathExists } = require('../../lib/file-utils');

const SPEC_BASENAMES = ['openapi', 'swagger', 'api-docs', 'api-spec'];
const SPEC_EXTENSIONS = ['json', 'yaml', 'yml'];

const OPENAPI_FILENAMES = SPEC_BASENAMES.flatMap((base) =>
    SPEC_EXTENSIONS.map((ext) => `${base}.${ext}`),
);

/**
 * Searched in order; the first match (sorted for determinism) wins.
 * Covers springdoc-maven-plugin output (target/), Gradle (build/), docs
 * folders and multi-module resources.
 */
const SPEC_FILE_GLOB = `{${SPEC_BASENAMES.join(',')}}.{${SPEC_EXTENSIONS.join(',')}}`;

const OPENAPI_GLOB_PATTERNS = [
    SPEC_FILE_GLOB,
    `src/main/resources/**/${SPEC_FILE_GLOB}`,
    `{docs,doc,api,spec,specs,contracts}/**/${SPEC_FILE_GLOB}`,
    `{target,build}/${SPEC_FILE_GLOB}`,
    `*/src/main/resources/**/${SPEC_FILE_GLOB}`,
];

function isOpenApiFile(filepath) {
    const basename = path.basename(filepath).toLowerCase();
    return (
        OPENAPI_FILENAMES.includes(basename) ||
        ['.json', '.yaml', '.yml'].includes(path.extname(filepath).toLowerCase())
    );
}

async function findOpenApiSpec(projectPath) {
    if ((await isFile(projectPath)) && isOpenApiFile(projectPath)) {
        return projectPath;
    }

    if (!(await pathExists(projectPath))) {
        return null;
    }

    for (const pattern of OPENAPI_GLOB_PATTERNS) {
        const matches = await glob(pattern, {
            cwd: projectPath,
            nodir: true,
            absolute: true,
            windowsPathsNoEscape: true,
        });
        if (matches.length > 0) {
            return matches.sort()[0];
        }
    }

    return null;
}

module.exports = {
    OPENAPI_FILENAMES,
    isOpenApiFile,
    findOpenApiSpec,
};
