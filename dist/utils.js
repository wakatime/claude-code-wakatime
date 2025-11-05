"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
class Utils {
    static quote(str) {
        if (str.includes(' '))
            return `"${str.replace('"', '\\"')}"`;
        return str;
    }
    static apiKeyInvalid(key) {
        const err = 'Invalid api key... check https://wakatime.com/api-key for your key';
        if (!key)
            return err;
        const re = new RegExp('^(waka_)?[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$', 'i');
        if (!re.test(key))
            return err;
        return '';
    }
    static formatDate(date) {
        let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let ampm = 'AM';
        let hour = date.getHours();
        if (hour > 11) {
            ampm = 'PM';
            hour = hour - 12;
        }
        if (hour == 0) {
            hour = 12;
        }
        let minute = date.getMinutes();
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hour}:${minute < 10 ? `0${minute}` : minute} ${ampm}`;
    }
    static obfuscateKey(key) {
        let newKey = '';
        if (key) {
            newKey = key;
            if (key.length > 4)
                newKey = 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX' + key.substring(key.length - 4);
        }
        return newKey;
    }
    static wrapArg(arg) {
        if (arg.indexOf(' ') > -1)
            return '"' + arg.replace(/"/g, '\\"') + '"';
        return arg;
    }
    static formatArguments(binary, args) {
        let clone = args.slice(0);
        clone.unshift(this.wrapArg(binary));
        let newCmds = [];
        let lastCmd = '';
        for (let i = 0; i < clone.length; i++) {
            if (lastCmd == '--key')
                newCmds.push(this.wrapArg(this.obfuscateKey(clone[i])));
            else
                newCmds.push(this.wrapArg(clone[i]));
            lastCmd = clone[i];
        }
        return newCmds.join(' ');
    }
    static apiUrlToDashboardUrl(url) {
        url = url
            .replace('://api.', '://')
            .replace('/api/v1', '')
            .replace(/^api\./, '')
            .replace('/api', '');
        return url;
    }
    static isWindows() {
        return os.platform() === 'win32';
    }
    static getHomeDirectory() {
        let home = process.env.WAKATIME_HOME;
        if (home && home.trim() && fs.existsSync(home.trim()))
            return home.trim();
        return process.env[this.isWindows() ? 'USERPROFILE' : 'HOME'] || process.cwd();
    }
    static buildOptions(stdin) {
        const options = {
            windowsHide: true,
        };
        if (stdin) {
            options.stdio = ['pipe', 'pipe', 'pipe'];
        }
        if (!this.isWindows() && !process.env.WAKATIME_HOME && !process.env.HOME) {
            options['env'] = { ...process.env, WAKATIME_HOME: this.getHomeDirectory() };
        }
        return options;
    }
    static timestamp() {
        return Date.now() / 1000;
    }
}
exports.Utils = Utils;
