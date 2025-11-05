#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const options_1 = require("./options");
const version_1 = require("./version");
const dependencies_1 = require("./dependencies");
const utils_1 = require("./utils");
const logger_1 = require("./logger");
const STATE_FILE = path_1.default.join(os_1.default.homedir(), '.wakatime', 'claude-code.json');
const WAKATIME_CLI = path_1.default.join(os_1.default.homedir(), '.wakatime', 'wakatime-cli');
const logger = new logger_1.Logger();
function shouldSendHeartbeat(inp) {
    if (inp?.hook_event_name === 'Stop') {
        return true;
    }
    try {
        const last = JSON.parse(fs_1.default.readFileSync(STATE_FILE, 'utf-8')).lastHeartbeatAt ?? utils_1.Utils.timestamp();
        return utils_1.Utils.timestamp() - last >= 60;
    }
    catch {
        return true;
    }
}
function parseInput() {
    try {
        const stdinData = fs_1.default.readFileSync(0, 'utf-8');
        if (stdinData.trim()) {
            const input = JSON.parse(stdinData);
            return input;
        }
    }
    catch (err) {
        console.error(err);
    }
    return undefined;
}
function getLastHeartbeat() {
    try {
        const stateData = JSON.parse(fs_1.default.readFileSync(STATE_FILE, 'utf-8'));
        return stateData.lastHeartbeatAt ?? 0;
    }
    catch {
        return 0;
    }
}
function getModifiedFile(transcriptPath) {
    try {
        if (!transcriptPath || !fs_1.default.existsSync(transcriptPath)) {
            return undefined;
        }
        const content = fs_1.default.readFileSync(transcriptPath, 'utf-8');
        const lines = content.split('\n');
        const fileLineChanges = new Map();
        const lastHeartbeatAt = getLastHeartbeat();
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const logEntry = JSON.parse(line);
                    if (!logEntry.timestamp)
                        continue;
                    const entryTimestamp = new Date(logEntry.timestamp).getTime() / 1000;
                    if (entryTimestamp >= lastHeartbeatAt) {
                        let filePath;
                        // Check for file paths in tool use results
                        if (logEntry.toolUse?.parameters?.file_path) {
                            filePath = logEntry.toolUse.parameters.file_path;
                        }
                        // Check for file paths in tool use results for multi-edit
                        if (logEntry.toolUse?.parameters?.edits) {
                            filePath = logEntry.toolUse.parameters.file_path;
                        }
                        // Check for file paths and line changes in structured patch
                        if (logEntry.toolUseResult?.structuredPatch) {
                            const patches = logEntry.toolUseResult.structuredPatch;
                            for (const patch of patches) {
                                if (patch.file) {
                                    filePath = patch.file;
                                    if (patch.newLines !== undefined && patch.oldLines !== undefined) {
                                        const lineChanges = Math.abs(patch.newLines - patch.oldLines);
                                        fileLineChanges.set(filePath, (fileLineChanges.get(filePath) || 0) + lineChanges);
                                    }
                                }
                            }
                        }
                        if (filePath && !fileLineChanges.has(filePath)) {
                            fileLineChanges.set(filePath, 0);
                        }
                    }
                }
                catch {
                    // ignore
                }
            }
        }
        if (fileLineChanges.size === 0) {
            return undefined;
        }
        // Find file with most line changes
        let maxChanges = 0;
        let mostChangedFile;
        for (const [file, changes] of fileLineChanges.entries()) {
            if (changes > maxChanges) {
                maxChanges = changes;
                mostChangedFile = file;
            }
        }
        return mostChangedFile;
    }
    catch {
        return undefined;
    }
}
function calculateLineChanges(transcriptPath) {
    try {
        if (!transcriptPath || !fs_1.default.existsSync(transcriptPath)) {
            return 0;
        }
        const content = fs_1.default.readFileSync(transcriptPath, 'utf-8');
        const lines = content.split('\n');
        let totalLineChanges = 0;
        const lastHeartbeatAt = getLastHeartbeat();
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const logEntry = JSON.parse(line);
                    // Only count changes since last heartbeat
                    if (logEntry.timestamp && logEntry.toolUseResult?.structuredPatch) {
                        const entryTimestamp = new Date(logEntry.timestamp).getTime() / 1000;
                        if (entryTimestamp >= lastHeartbeatAt) {
                            const patches = logEntry.toolUseResult.structuredPatch;
                            for (const patch of patches) {
                                if (patch.newLines !== undefined && patch.oldLines !== undefined) {
                                    totalLineChanges += patch.newLines - patch.oldLines;
                                }
                            }
                        }
                    }
                }
                catch {
                    // ignore
                }
            }
        }
        return totalLineChanges;
    }
    catch {
        return 0;
    }
}
function updateState() {
    fs_1.default.mkdirSync(path_1.default.dirname(STATE_FILE), { recursive: true });
    fs_1.default.writeFileSync(STATE_FILE, JSON.stringify({ lastHeartbeatAt: utils_1.Utils.timestamp() }, null, 2));
}
function sendHeartbeat(inp) {
    const projectFolder = inp?.cwd;
    try {
        let entity = 'claude code';
        if (inp?.transcript_path) {
            const modifiedFile = getModifiedFile(inp.transcript_path);
            if (modifiedFile) {
                entity = modifiedFile;
            }
        }
        const args = [
            '--entity',
            entity,
            '--entity-type',
            entity === 'claude code' ? 'app' : 'file',
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
            const lineChanges = calculateLineChanges(inp.transcript_path);
            if (lineChanges) {
                args.push('--ai-line-changes');
                args.push(lineChanges.toString());
            }
        }
        const options = utils_1.Utils.buildOptions();
        (0, child_process_1.execFile)(WAKATIME_CLI, args, options, (error, _stdout, stderr) => {
            const output = _stdout.toString().trim() + stderr.toString().trim();
            if (output) {
                logger.error(output);
            }
            if (!(error != null)) {
                logger.debug(`Sending heartbeat: ${args}`);
            }
        });
    }
    catch (err) {
        logger.errorException(err);
    }
}
function main() {
    const inp = parseInput();
    const options = new options_1.Options();
    const debug = options.getSetting('settings', 'debug');
    logger.setLevel(debug === 'true' ? logger_1.LogLevel.DEBUG : logger_1.LogLevel.INFO);
    const deps = new dependencies_1.Dependencies(options, logger);
    if (inp) {
        try {
            logger.debug(JSON.stringify(inp, null, 2));
        }
        catch (err) {
            // ignore
        }
    }
    if (inp?.hook_event_name === 'SessionStart') {
        deps.checkAndInstallCli();
    }
    if (shouldSendHeartbeat(inp)) {
        sendHeartbeat(inp);
        updateState();
    }
}
main();
