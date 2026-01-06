#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const options_1 = require("./options");
const version_1 = require("./version");
const dependencies_1 = require("./dependencies");
const logger_1 = require("./logger");
const utils_1 = require("./utils");
const options = new options_1.Options();
const deps = new dependencies_1.Dependencies(options, logger_1.logger);
async function sendHeartbeat(inp) {
    const projectFolder = inp?.cwd;
    const { entities, claudeVersion } = await (0, utils_1.getEntityFiles)(inp);
    if (entities.size === 0)
        return false;
    const wakatime_cli = deps.getCliLocation();
    for (const [entityFile, entityData] of entities.entries()) {
        logger_1.logger.debug(`Entity: ${entityFile}`);
        const args = [
            '--entity',
            entityFile,
            '--entity-type',
            entityData.type,
            '--category',
            'ai coding',
            '--plugin',
            `claude/${claudeVersion} claude-code-wakatime/${version_1.VERSION}`,
        ];
        if (projectFolder) {
            args.push('--project-folder');
            args.push(projectFolder);
        }
        if (entityData.lineChanges) {
            args.push('--ai-line-changes');
            args.push(entityData.lineChanges.toString());
        }
        logger_1.logger.debug(`Sending heartbeat: ${(0, utils_1.formatArguments)(wakatime_cli, args)}`);
        const execOptions = (0, utils_1.buildOptions)();
        (0, child_process_1.execFile)(wakatime_cli, args, execOptions, (error, stdout, stderr) => {
            const output = stdout.toString().trim() + stderr.toString().trim();
            if (output)
                logger_1.logger.error(output);
            if (error)
                logger_1.logger.error(error.toString());
        });
    }
    return true;
}
async function main() {
    const inp = (0, utils_1.parseInput)();
    const debug = options.getSetting('settings', 'debug');
    logger_1.logger.setLevel(debug === 'true' ? logger_1.LogLevel.DEBUG : logger_1.LogLevel.INFO);
    try {
        if (inp)
            logger_1.logger.debug(JSON.stringify(inp, null, 2));
        deps.checkAndInstallCli();
        if ((0, utils_1.shouldSendHeartbeat)(inp)) {
            if (await sendHeartbeat(inp)) {
                await (0, utils_1.updateState)(inp);
            }
        }
    }
    catch (err) {
        logger_1.logger.errorException(err);
    }
}
main();
