const path = require('path');
const { glob } = require('glob');
const { isFile, pathExists } = require('../../lib/file-utils');

const OPENAPI_FILENAMES = [
    'openapi.json',
    'openapi.yaml',
    'openapi.yml',
    'swagger.json',
    'swagger.yaml',
    'swagger.yml',
];

const OPENAPI_GLOB_PATTERNS = [
    'openapi.json',
    'openapi.yaml',
    'openapi.yml',
    'swagger.json',
    'swagger.yaml',
    'swagger.yml',
    'src/main/resources/**/openapi.json',
    'src/main/resources/**/openapi.yaml',
    'src/main/resources/**/openapi.yml',
    'src/main/resources/**/swagger.json',
    'src/main/resources/**/swagger.yaml',
    'src/main/resources/**/swagger.yml',
    'src/main/resources/static/**/openapi.json',
    'src/main/resources/static/**/swagger.json',
    'docs/**/openapi.json',
    'docs/**/openapi.yaml',
    'docs/**/swagger.json',
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

    for (const filename of OPENAPI_FILENAMES) {
        const filepath = path.join(projectPath, filename);
        if (await isFile(filepath)) {
            return filepath;
        }
    }

    for (const pattern of OPENAPI_GLOB_PATTERNS) {
        const matches = await glob(path.join(projectPath, pattern), { nodir: true });
        if (matches.length > 0) {
            return matches[0];
        }
    }

    return null;
}

module.exports = {
    OPENAPI_FILENAMES,
    isOpenApiFile,
    findOpenApiSpec,
};
