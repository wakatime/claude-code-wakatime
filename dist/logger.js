"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
const LOG_FILE = path_1.default.join(os_1.default.homedir(), '.wakatime', 'claude-code.log');
class Logger {
    constructor(level) {
        this.level = LogLevel.INFO;
        if (level !== undefined)
            this.setLevel(level);
    }
    getLevel() {
        return this.level;
    }
    setLevel(level) {
        this.level = level;
    }
    log(level, msg) {
        if (level >= this.level) {
            msg = `[${new Date().toISOString()}][${LogLevel[level]}] ${msg}\n`;
            fs_1.default.mkdirSync(path_1.default.dirname(LOG_FILE), { recursive: true });
            fs_1.default.appendFileSync(LOG_FILE, msg);
        }
    }
    debug(msg) {
        this.log(LogLevel.DEBUG, msg);
    }
    debugException(msg) {
        if (msg.message !== undefined) {
            this.log(LogLevel.DEBUG, msg.message);
        }
        else {
            this.log(LogLevel.DEBUG, msg.toString());
        }
    }
    info(msg) {
        this.log(LogLevel.INFO, msg);
    }
    warn(msg) {
        this.log(LogLevel.WARN, msg);
    }
    warnException(msg) {
        if (msg.message !== undefined) {
            this.log(LogLevel.WARN, msg.message);
        }
        else {
            this.log(LogLevel.WARN, msg.toString());
        }
    }
    error(msg) {
        this.log(LogLevel.ERROR, msg);
    }
    errorException(msg) {
        if (msg.message !== undefined) {
            this.log(LogLevel.ERROR, msg.message);
        }
        else {
            this.log(LogLevel.ERROR, msg.toString());
        }
    }
}
exports.Logger = Logger;
