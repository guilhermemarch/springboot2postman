const chalk = require('chalk');
const ora = require('ora');

class Logger {
    /**
     * @param {boolean} verbose show debug output
     * @param {boolean} quiet suppress everything except errors (for CI and
     *   piping); disables the spinner entirely.
     */
    constructor(verbose = false, quiet = false) {
        this.verbose = verbose && !quiet;
        this.quiet = quiet;
        this.spinner = null;
    }

    info(message) {
        if (this.quiet) return;
        console.log(chalk.blue('i'), message);
    }

    success(message) {
        if (this.quiet) return;
        console.log(chalk.green('ok'), message);
    }

    warn(message) {
        if (this.quiet) return;
        console.log(chalk.yellow('warn'), message);
    }

    error(message) {
        console.error(chalk.red('error'), message);
    }

    debug(message) {
        if (this.verbose) {
            console.log(chalk.gray('debug'), message);
        }
    }

    startSpinner(message) {
        if (this.quiet) return null;
        if (this.spinner) {
            this.spinner.stop();
        }
        this.spinner = ora({ text: message, isEnabled: process.stderr.isTTY }).start();
        return this.spinner;
    }

    updateSpinner(message) {
        if (this.spinner) {
            this.spinner.text = message;
        }
    }

    succeedSpinner(message) {
        if (this.spinner) {
            this.spinner.succeed(message);
            this.spinner = null;
        }
    }

    failSpinner(message) {
        if (this.spinner) {
            this.spinner.fail(message);
            this.spinner = null;
        }
    }

    stopSpinner() {
        if (this.spinner) {
            this.spinner.stop();
            this.spinner = null;
        }
    }
}

module.exports = Logger;
