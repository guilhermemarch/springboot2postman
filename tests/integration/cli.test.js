const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const cliPath = path.join(__dirname, '../../cli/index.js');
const fixtureRoot = path.join(__dirname, '../fixtures/spring-app');

function runCli(args) {
    const result = spawnSync('node', [cliPath, ...args], {
        encoding: 'utf8',
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

describe('CLI integration', () => {
    test('validate command succeeds for fixture project', () => {
        const result = runCli(['validate', '--project', fixtureRoot]);
        expect(result.status).toBe(0);
        expect(result.output).toContain('Strategy: ParserStrategy');
    });

    test('generate --dry-run does not write output file', () => {
        const outFile = path.join(os.tmpdir(), `dry-run-${Date.now()}.json`);
        const result = runCli([
            'generate',
            '--project',
            fixtureRoot,
            '--out',
            outFile,
            '--dry-run',
            '--seed',
            '42',
        ]);

        expect(result.status).toBe(0);
        expect(result.output).toContain('No files written (--dry-run)');
        expect(fs.existsSync(outFile)).toBe(false);
    });

    test('generate writes environment file with --env-out', () => {
        const outFile = path.join(os.tmpdir(), `collection-${Date.now()}.json`);
        const envFile = path.join(os.tmpdir(), `environment-${Date.now()}.json`);

        const result = runCli([
            'generate',
            '--project',
            fixtureRoot,
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
        expect(env.values.find((v) => v.key === 'baseUrl').value).toBe('http://localhost:8080/app');

        fs.unlinkSync(outFile);
        fs.unlinkSync(envFile);
    });
});
