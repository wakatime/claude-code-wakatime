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
exports.Options = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("./utils");
class Options {
    constructor() {
        const home = utils_1.Utils.getHomeDirectory();
        const wakaFolder = path.join(home, '.wakatime');
        try {
            if (!fs.existsSync(wakaFolder)) {
                fs.mkdirSync(wakaFolder, { recursive: true });
            }
            this.resourcesLocation = wakaFolder;
        }
        catch (e) {
            console.error(e);
            throw e;
        }
        this.configFile = path.join(home, '.wakatime.cfg');
        this.internalConfigFile = path.join(this.resourcesLocation, 'wakatime-internal.cfg');
        this.logFile = path.join(this.resourcesLocation, 'wakatime.log');
    }
    getSetting(section, key, internal) {
        const content = fs.readFileSync(this.getConfigFile(internal ?? false), 'utf-8');
        if (content.trim()) {
            let currentSection = '';
            let lines = content.split('\n');
            for (var i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
                    currentSection = line
                        .trim()
                        .substring(1, line.trim().length - 1)
                        .toLowerCase();
                }
                else if (currentSection === section) {
                    let parts = line.split('=');
                    let currentKey = parts[0].trim();
                    if (currentKey === key && parts.length > 1) {
                        return this.removeNulls(parts[1].trim());
                    }
                }
            }
            return undefined;
        }
    }
    setSetting(section, key, val, internal) {
        const configFile = this.getConfigFile(internal);
        fs.readFile(configFile, 'utf-8', (err, content) => {
            // ignore errors because config file might not exist yet
            if (err)
                content = '';
            let contents = [];
            let currentSection = '';
            let found = false;
            let lines = content.split('\n');
            for (var i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
                    if (currentSection === section && !found) {
                        contents.push(this.removeNulls(key + ' = ' + val));
                        found = true;
                    }
                    currentSection = line
                        .trim()
                        .substring(1, line.trim().length - 1)
                        .toLowerCase();
                    contents.push(this.removeNulls(line));
                }
                else if (currentSection === section) {
                    let parts = line.split('=');
                    let currentKey = parts[0].trim();
                    if (currentKey === key) {
                        if (!found) {
                            contents.push(this.removeNulls(key + ' = ' + val));
                            found = true;
                        }
                    }
                    else {
                        contents.push(this.removeNulls(line));
                    }
                }
                else {
                    contents.push(this.removeNulls(line));
                }
            }
            if (!found) {
                if (currentSection !== section) {
                    contents.push('[' + section + ']');
                }
                contents.push(this.removeNulls(key + ' = ' + val));
            }
            fs.writeFile(configFile, contents.join('\n'), (err) => {
                if (err)
                    throw err;
            });
        });
    }
    setSettings(section, settings, internal) {
        const configFile = this.getConfigFile(internal);
        fs.readFile(configFile, 'utf-8', (err, content) => {
            // ignore errors because config file might not exist yet
            if (err)
                content = '';
            let contents = [];
            let currentSection = '';
            const found = {};
            let lines = content.split('\n');
            for (var i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
                    if (currentSection === section) {
                        settings.forEach((setting) => {
                            if (!found[setting.key]) {
                                contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
                                found[setting.key] = true;
                            }
                        });
                    }
                    currentSection = line
                        .trim()
                        .substring(1, line.trim().length - 1)
                        .toLowerCase();
                    contents.push(this.removeNulls(line));
                }
                else if (currentSection === section) {
                    let parts = line.split('=');
                    let currentKey = parts[0].trim();
                    let keepLineUnchanged = true;
                    settings.forEach((setting) => {
                        if (currentKey === setting.key) {
                            keepLineUnchanged = false;
                            if (!found[setting.key]) {
                                contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
                                found[setting.key] = true;
                            }
                        }
                    });
                    if (keepLineUnchanged) {
                        contents.push(this.removeNulls(line));
                    }
                }
                else {
                    contents.push(this.removeNulls(line));
                }
            }
            settings.forEach((setting) => {
                if (!found[setting.key]) {
                    if (currentSection !== section) {
                        contents.push('[' + section + ']');
                        currentSection = section;
                    }
                    contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
                    found[setting.key] = true;
                }
            });
            fs.writeFile(configFile, contents.join('\n'), (err) => {
                if (err)
                    throw err;
            });
        });
    }
    getConfigFile(internal) {
        return internal ? this.internalConfigFile : this.configFile;
    }
    getLogFile() {
        return this.logFile;
    }
    startsWith(outer, inner) {
        return outer.slice(0, inner.length) === inner;
    }
    endsWith(outer, inner) {
        return inner === '' || outer.slice(-inner.length) === inner;
    }
    removeNulls(s) {
        return s.replace(/\0/g, '');
    }
}
exports.Options = Options;
