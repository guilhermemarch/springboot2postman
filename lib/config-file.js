const path = require('path');
const { readFile, isFile } = require('./file-utils');

const CONFIG_FILENAMES = ['springboot2postman.config.json', '.springboot2postmanrc.json'];

/**
 * Load config file defaults from the working directory. CLI flags always
 * win; the file only fills options the user did not pass.
 */
async function loadConfigFile(cwd = process.cwd()) {
    for (const filename of CONFIG_FILENAMES) {
        const filepath = path.join(cwd, filename);
        if (!(await isFile(filepath))) {
            continue;
        }
        try {
            const parsed = JSON.parse(await readFile(filepath));
            if (parsed && typeof parsed === 'object') {
                return { ...parsed, __source: filepath };
            }
        } catch (error) {
            throw new Error(`Invalid config file ${filepath}: ${error.message}`);
        }
    }
    return {};
}

/**
 * Merge CLI options over config file values. Only keys the CLI left
 * undefined are taken from the file.
 */
function mergeOptions(cliOptions, fileOptions) {
    const merged = { ...cliOptions };
    for (const [key, value] of Object.entries(fileOptions)) {
        if (key === '__source') {
            continue;
        }
        if (merged[key] === undefined) {
            merged[key] = value;
        }
    }
    return merged;
}

module.exports = { loadConfigFile, mergeOptions, CONFIG_FILENAMES };
