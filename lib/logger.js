const chalk = require('chalk');
const ora = require('ora');

class Logger {
    constructor(verbose = false) {
        this.verbose = verbose;
        this.spinner = null;
    }

    info(message) {
        console.log(chalk.blue('ℹ'), message);
    }

    success(message) {
        console.log(chalk.green('✔'), message);
    }

    warn(message) {
        console.log(chalk.yellow('⚠'), message);
    }

    error(message) {
        console.error(chalk.red('✖'), message);
    }

    debug(message) {
        if (this.verbose) {
            console.log(chalk.gray('→'), message);
        }
    }

    startSpinner(message) {
        if (this.spinner) {
            this.spinner.stop();
        }
        this.spinner = ora(message).start();
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
