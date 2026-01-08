const fs = require('fs').promises;
const path = require('path');
const { ProjectNotFoundError } = require('./errors');

async function pathExists(filepath) {
    try {
        await fs.access(filepath);
        return true;
    } catch {
        return false;
    }
}

async function isDirectory(filepath) {
    try {
        const stats = await fs.stat(filepath);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

async function isFile(filepath) {
    try {
        const stats = await fs.stat(filepath);
        return stats.isFile();
    } catch {
        return false;
    }
}

async function readFile(filepath) {
    if (!(await pathExists(filepath))) {
        throw new ProjectNotFoundError(filepath);
    }
    return await fs.readFile(filepath, 'utf8');
}

async function writeFile(filepath, content) {
    const dir = path.dirname(filepath);

    if (!(await pathExists(dir))) {
        await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(filepath, content, 'utf8');
}

function isUrl(input) {
    return input.startsWith('http://') || input.startsWith('https://');
}

function resolvePath(filepath) {
    return path.resolve(filepath);
}

function getExtension(filepath) {
    return path.extname(filepath).toLowerCase();
}

module.exports = {
    pathExists,
    isDirectory,
    isFile,
    readFile,
    writeFile,
    isUrl,
    resolvePath,
    getExtension,
};
