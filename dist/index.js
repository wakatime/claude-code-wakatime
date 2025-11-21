#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const options_1 = require("./options");
const version_1 = require("./version");
const dependencies_1 = require("./dependencies");
const logger_1 = require("./logger");
const utils_1 = require("./utils");
const logger = new logger_1.Logger();
const options = new options_1.Options();
const deps = new dependencies_1.Dependencies(options, logger);
function sendHeartbeat(inp) {
    const projectFolder = inp?.cwd;
    const entity = (0, utils_1.getEntityFile)(inp);
    logger.debug(`Entity: ${entity}`);
    if (!entity)
        return false;
    const wakatime_cli = deps.getCliLocation();
    const args = [
        '--entity',
        entity,
        '--entity-type',
        'file',
        '--category',
        'ai coding',
        '--plugin',
        `claude-code-wakatime/${version_1.VERSION}`,
    ];
    if (projectFolder) {
        args.push('--project-folder');
        args.push(projectFolder);
    }
    if (inp?.transcript_path) {
        const lineChanges = (0, utils_1.calculateLineChanges)(inp.transcript_path);
        if (lineChanges) {
            args.push('--ai-line-changes');
            args.push(lineChanges.toString());
        }
    }
    logger.debug(`Sending heartbeat: ${(0, utils_1.formatArguments)(wakatime_cli, args)}`);
    const execOptions = (0, utils_1.buildOptions)();
    (0, child_process_1.execFile)(wakatime_cli, args, execOptions, (error, stdout, stderr) => {
        const output = stdout.toString().trim() + stderr.toString().trim();
        if (output)
            logger.error(output);
        if (error)
            logger.error(error.toString());
    });
    return true;
}
function main() {
    const inp = (0, utils_1.parseInput)();
    const debug = options.getSetting('settings', 'debug');
    logger.setLevel(debug === 'true' ? logger_1.LogLevel.DEBUG : logger_1.LogLevel.INFO);
    try {
        if (inp)
            logger.debug(JSON.stringify(inp, null, 2));
        deps.checkAndInstallCli();
        if ((0, utils_1.shouldSendHeartbeat)(inp)) {
            if (sendHeartbeat(inp)) {
                (0, utils_1.updateState)();
            }
        }
    }
    catch (err) {
        logger.errorException(err);
    }
}
main();
