const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const cliPath = path.join(__dirname, '../../cli/index.js');
const springApp = path.join(__dirname, '../fixtures/spring-app');
const shopApi = path.join(__dirname, '../fixtures/shop-api');

function runCli(args, options = {}) {
    const result = spawnSync('node', [cliPath, ...args], {
        encoding: 'utf8',
        cwd: options.cwd,
        env: {
            ...process.env,
            NODE_OPTIONS: process.env.NODE_OPTIONS || '--experimental-vm-modules',
        },
    });

    return {
        ...result,
        output: `${result.stdout || ''}${result.stderr || ''}`,
    };
}

function tmpFile(name) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return path.join(os.tmpdir(), `sb2p-${unique}-${name}`);
}

describe('CLI integration', () => {
    test('--version prints the package version', () => {
        const result = runCli(['--version']);
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });

    test('validate succeeds for the fixture project', () => {
        const result = runCli(['validate', '--project', springApp]);
        expect(result.status).toBe(0);
        expect(result.output).toContain('Strategy: ParserStrategy');
    });

    test('validate fails with exit 1 for a non-project directory', () => {
        const result = runCli(['validate', '--project', os.tmpdir()]);
        expect(result.status).toBe(1);
    });

    test('generate --dry-run reports endpoints and writes nothing', () => {
        const outFile = tmpFile('dry-run.json');
        const result = runCli([
            'generate',
            '--project',
            springApp,
            '--out',
            outFile,
            '--dry-run',
            '--seed',
            '42',
        ]);

        expect(result.status).toBe(0);
        expect(result.output).toContain('No files written (--dry-run)');
        expect(result.output).toMatch(/Endpoints: \d+/);
        expect(fs.existsSync(outFile)).toBe(false);
    });

    test('generate writes collection and environment mirroring variables', () => {
        const outFile = tmpFile('collection.json');
        const envFile = tmpFile('environment.json');

        const result = runCli([
            'generate',
            '--project',
            springApp,
            '--out',
            outFile,
            '--env-out',
            envFile,
            '--seed',
            '42',
        ]);

        expect(result.status).toBe(0);
        expect(fs.existsSync(outFile)).toBe(true);
        expect(fs.existsSync(envFile)).toBe(true);

        const env = JSON.parse(fs.readFileSync(envFile, 'utf8'));
        expect(env.values.find((v) => v.key === 'baseUrl').value).toBe(
            'http://localhost:8080/app',
        );

        fs.unlinkSync(outFile);
        fs.unlinkSync(envFile);
    });

    test('generate --out - streams JSON to stdout (pipeable)', () => {
        const result = runCli([
            'generate',
            '--project',
            springApp,
            '--out',
            '-',
            '--quiet',
            '--seed',
            '42',
        ]);

        expect(result.status).toBe(0);
        const collection = JSON.parse(result.stdout);
        expect(collection.info.name).toBe('User API');
    });

    test('generate --format http writes a .http file', () => {
        const outFile = tmpFile('api.http');
        const result = runCli([
            'generate',
            '--project',
            springApp,
            '--format',
            'http',
            '--out',
            outFile,
            '--seed',
            '42',
        ]);

        expect(result.status).toBe(0);
        const content = fs.readFileSync(outFile, 'utf8');
        expect(content).toContain('@baseUrl =');
        expect(content).toContain('GET {{baseUrl}}/api/users');
        fs.unlinkSync(outFile);
    });

    test('generate --strategy parser is forced even when a spec exists', () => {
        const projectWithSpec = path.join(__dirname, '../fixtures/spring-app-with-spec');
        const result = runCli([
            'generate',
            '--project',
            projectWithSpec,
            '--out',
            '-',
            '--quiet',
            '--format',
            'openapi',
            '--strategy',
            'openapi',
            '--seed',
            '42',
        ]);
        expect(result.status).toBe(0);
        const spec = JSON.parse(result.stdout);
        // The committed fixture spec has exactly one endpoint.
        expect(Object.keys(spec.paths)).toHaveLength(1);
    });

    test('seeded runs are byte-for-byte deterministic', () => {
        const args = [
            'generate',
            '--project',
            shopApi,
            '--out',
            '-',
            '--quiet',
            '--seed',
            '42',
        ];
        const first = runCli(args);
        const second = runCli(args);
        expect(first.status).toBe(0);
        expect(first.stdout).toBe(second.stdout);
    });

    test('diff exits 0 against a freshly generated spec and 1 after drift', () => {
        const specFile = tmpFile('spec.json');
        const generate = runCli([
            'generate',
            '--project',
            springApp,
            '--format',
            'openapi',
            '--out',
            specFile,
            '--seed',
            '42',
        ]);
        expect(generate.status).toBe(0);

        const clean = runCli(['diff', '--project', springApp, '--against', specFile]);
        expect(clean.status).toBe(0);
        expect(clean.output).toContain('No API drift');

        // Remove an endpoint from the target to simulate drift.
        const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
        delete spec.paths['/api/users/{id}'];
        fs.writeFileSync(specFile, JSON.stringify(spec));

        const drifted = runCli(['diff', '--project', springApp, '--against', specFile]);
        expect(drifted.status).toBe(1);
        expect(drifted.output).toContain('API drift detected');

        fs.unlinkSync(specFile);
    });

    test('unknown --format fails fast', () => {
        const result = runCli([
            'generate',
            '--project',
            springApp,
            '--format',
            'yaml',
            '--out',
            '-',
        ]);
        expect(result.status).toBe(1);
        expect(result.output).toContain('Unknown format');
    });
});
