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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dependencies = void 0;
const adm_zip_1 = __importDefault(require("adm-zip"));
const child_process = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const request = __importStar(require("request"));
const semver = __importStar(require("semver"));
const which = __importStar(require("which"));
const utils_1 = require("./utils");
var osName;
(function (osName) {
    osName["darwin"] = "darwin";
    osName["windows"] = "windows";
    osName["linux"] = "linux";
})(osName || (osName = {}));
class Dependencies {
    constructor(options, logger) {
        this.cliLocation = undefined;
        this.cliLocationGlobal = undefined;
        this.cliInstalled = false;
        this.githubDownloadUrl = 'https://github.com/wakatime/wakatime-cli/releases/latest/download';
        this.githubReleasesUrl = 'https://api.github.com/repos/wakatime/wakatime-cli/releases/latest';
        this.legacyOperatingSystems = {
            [osName.darwin]: [{ kernelLessThan: '17.0.0', tag: 'v1.39.1-alpha.1' }],
        };
        this.options = options;
        this.logger = logger;
        this.resourcesLocation = options.resourcesLocation;
    }
    getCliLocation() {
        if (this.cliLocation)
            return this.cliLocation;
        this.cliLocation = this.getCliLocationGlobal();
        if (this.cliLocation)
            return this.cliLocation;
        const osname = this.osName();
        const arch = this.architecture();
        const ext = utils_1.Utils.isWindows() ? '.exe' : '';
        const binary = `wakatime-cli-${osname}-${arch}${ext}`;
        this.cliLocation = path.join(this.resourcesLocation, binary);
        return this.cliLocation;
    }
    getCliLocationGlobal() {
        if (this.cliLocationGlobal)
            return this.cliLocationGlobal;
        const binaryName = `wakatime-cli${utils_1.Utils.isWindows() ? '.exe' : ''}`;
        const path = which.sync(binaryName, { nothrow: true });
        if (path) {
            this.cliLocationGlobal = path;
            this.logger.debug(`Using global wakatime-cli location: ${path}`);
        }
        return this.cliLocationGlobal;
    }
    isCliInstalled() {
        if (this.cliInstalled)
            return true;
        this.cliInstalled = fs.existsSync(this.getCliLocation());
        return this.cliInstalled;
    }
    checkAndInstallCli(callback) {
        if (!this.isCliInstalled()) {
            this.installCli(callback ?? (() => { }));
        }
        else {
            this.isCliLatest((isLatest) => {
                if (!isLatest) {
                    this.installCli(callback ?? (() => { }));
                }
                else {
                    callback?.();
                }
            });
        }
    }
    isCliLatest(callback) {
        if (this.getCliLocationGlobal()) {
            callback(true);
            return;
        }
        let args = ['--version'];
        const options = utils_1.Utils.buildOptions();
        try {
            child_process.execFile(this.getCliLocation(), args, options, (error, _stdout, stderr) => {
                if (!(error != null)) {
                    let currentVersion = _stdout.toString().trim() + stderr.toString().trim();
                    this.logger.debug(`Current wakatime-cli version is ${currentVersion}`);
                    if (currentVersion === '<local-build>') {
                        callback(true);
                        return;
                    }
                    const tag = this.legacyReleaseTag();
                    if (tag && currentVersion !== tag) {
                        callback(false);
                        return;
                    }
                    const accessed = this.options.getSetting('internal', 'cli_version_last_accessed', true);
                    const now = Math.round(Date.now() / 1000);
                    const lastAccessed = parseInt(accessed ?? '0');
                    const fourHours = 4 * 3600;
                    if (lastAccessed && lastAccessed + fourHours > now) {
                        this.logger.debug(`Skip checking for wakatime-cli updates because recently checked ${now - lastAccessed} seconds ago.`);
                        callback(true);
                        return;
                    }
                    this.logger.debug('Checking for updates to wakatime-cli...');
                    this.getLatestCliVersion((latestVersion) => {
                        if (currentVersion === latestVersion) {
                            this.logger.debug('wakatime-cli is up to date');
                            callback(true);
                        }
                        else if (latestVersion) {
                            this.logger.debug(`Found an updated wakatime-cli ${latestVersion}`);
                            callback(false);
                        }
                        else {
                            this.logger.debug('Unable to find latest wakatime-cli version');
                            callback(false);
                        }
                    });
                }
                else {
                    callback(false);
                }
            });
        }
        catch (e) {
            callback(false);
        }
    }
    getLatestCliVersion(callback) {
        const proxy = this.options.getSetting('settings', 'proxy');
        const noSSLVerify = this.options.getSetting('settings', 'no_ssl_verify');
        let options = {
            url: this.githubReleasesUrl,
            json: true,
            headers: {
                'User-Agent': 'github.com/wakatime/vscode-wakatime',
            },
        };
        this.logger.debug(`Fetching latest wakatime-cli version from GitHub API: ${options.url}`);
        if (proxy) {
            this.logger.debug(`Using Proxy: ${proxy}`);
            options['proxy'] = proxy;
        }
        if (noSSLVerify === 'true')
            options['strictSSL'] = false;
        try {
            request.get(options, (error, response, json) => {
                if (!error && response && response.statusCode == 200) {
                    this.logger.debug(`GitHub API Response ${response.statusCode}`);
                    const latestCliVersion = json['tag_name'];
                    this.logger.debug(`Latest wakatime-cli version from GitHub: ${latestCliVersion}`);
                    this.options.setSetting('internal', 'cli_version_last_accessed', String(Math.round(Date.now() / 1000)), true);
                    callback(latestCliVersion);
                }
                else {
                    if (response) {
                        this.logger.warn(`GitHub API Response ${response.statusCode}: ${error}`);
                    }
                    else {
                        this.logger.warn(`GitHub API Response Error: ${error}`);
                    }
                    callback('');
                }
            });
        }
        catch (e) {
            this.logger.warnException(e);
            callback('');
        }
    }
    installCli(callback) {
        this.logger.debug(`Downloading wakatime-cli from GitHub...`);
        const url = this.cliDownloadUrl();
        let zipFile = path.join(this.resourcesLocation, 'wakatime-cli' + this.randStr() + '.zip');
        this.downloadFile(url, zipFile, () => {
            this.extractCli(zipFile, callback);
        }, callback);
    }
    isSymlink(file) {
        try {
            return fs.lstatSync(file).isSymbolicLink();
        }
        catch (_) { }
        return false;
    }
    extractCli(zipFile, callback) {
        this.logger.debug(`Extracting wakatime-cli into "${this.resourcesLocation}"...`);
        this.backupCli();
        this.unzip(zipFile, this.resourcesLocation, (unzipped) => {
            if (!unzipped) {
                this.restoreCli();
            }
            else if (!utils_1.Utils.isWindows()) {
                this.removeCli();
                const cli = this.getCliLocation();
                try {
                    this.logger.debug('Chmod 755 wakatime-cli...');
                    fs.chmodSync(cli, 0o755);
                }
                catch (e) {
                    this.logger.warnException(e);
                }
                const ext = utils_1.Utils.isWindows() ? '.exe' : '';
                const link = path.join(this.resourcesLocation, `wakatime-cli${ext}`);
                if (!this.isSymlink(link)) {
                    try {
                        this.logger.debug(`Create symlink from wakatime-cli to ${cli}`);
                        fs.symlinkSync(cli, link);
                    }
                    catch (e) {
                        this.logger.warnException(e);
                        try {
                            fs.copyFileSync(cli, link);
                            fs.chmodSync(link, 0o755);
                        }
                        catch (e2) {
                            this.logger.warnException(e2);
                        }
                    }
                }
            }
            callback();
        });
        this.logger.debug('Finished extracting wakatime-cli.');
    }
    backupCli() {
        if (fs.existsSync(this.getCliLocation())) {
            fs.renameSync(this.getCliLocation(), `${this.getCliLocation()}.backup`);
        }
    }
    restoreCli() {
        const backup = `${this.getCliLocation()}.backup`;
        if (fs.existsSync(backup)) {
            fs.renameSync(backup, this.getCliLocation());
        }
    }
    removeCli() {
        const backup = `${this.getCliLocation()}.backup`;
        if (fs.existsSync(backup)) {
            fs.unlinkSync(backup);
        }
    }
    downloadFile(url, outputFile, callback, error) {
        const proxy = this.options.getSetting('settings', 'proxy');
        const noSSLVerify = this.options.getSetting('settings', 'no_ssl_verify');
        let options = { url: url };
        if (proxy) {
            this.logger.debug(`Using Proxy: ${proxy}`);
            options['proxy'] = proxy;
        }
        if (noSSLVerify === 'true')
            options['strictSSL'] = false;
        try {
            let r = request.get(options);
            r.on('error', (e) => {
                this.logger.warn(`Failed to download ${url}`);
                this.logger.warn(e.toString());
                error();
            });
            let out = fs.createWriteStream(outputFile);
            r.pipe(out);
            r.on('end', () => {
                out.on('finish', () => {
                    callback();
                });
            });
        }
        catch (e) {
            this.logger.warnException(e);
            callback();
        }
    }
    unzip(file, outputDir, callback) {
        if (fs.existsSync(file)) {
            try {
                let zip = new adm_zip_1.default(file);
                zip.extractAllTo(outputDir, true);
                fs.unlinkSync(file);
                callback(true);
                return;
            }
            catch (e) {
                this.logger.warnException(e);
            }
            try {
                fs.unlinkSync(file);
            }
            catch (e2) {
                this.logger.warnException(e2);
            }
            callback(false);
        }
    }
    legacyReleaseTag() {
        const osname = this.osName();
        const legacyOS = this.legacyOperatingSystems[osname];
        if (!legacyOS)
            return;
        const version = legacyOS.find((spec) => {
            try {
                return semver.lt(os.release(), spec.kernelLessThan);
            }
            catch (e) {
                return false;
            }
        });
        return version?.tag;
    }
    architecture() {
        const arch = os.arch();
        if (arch.indexOf('32') > -1)
            return '386';
        if (arch.indexOf('x64') > -1)
            return 'amd64';
        return arch;
    }
    osName() {
        let osname = os.platform();
        if (osname == 'win32')
            osname = 'windows';
        return osname;
    }
    cliDownloadUrl() {
        const osname = this.osName();
        const arch = this.architecture();
        // Use legacy wakatime-cli release to support older operating systems
        const tag = this.legacyReleaseTag();
        if (tag) {
            return `https://github.com/wakatime/wakatime-cli/releases/download/${tag}/wakatime-cli-${osname}-${arch}.zip`;
        }
        const validCombinations = [
            'android-amd64',
            'android-arm64',
            'darwin-amd64',
            'darwin-arm64',
            'freebsd-386',
            'freebsd-amd64',
            'freebsd-arm',
            'linux-386',
            'linux-amd64',
            'linux-arm',
            'linux-arm64',
            'netbsd-386',
            'netbsd-amd64',
            'netbsd-arm',
            'openbsd-386',
            'openbsd-amd64',
            'openbsd-arm',
            'openbsd-arm64',
            'windows-386',
            'windows-amd64',
            'windows-arm64',
        ];
        if (!validCombinations.includes(`${osname}-${arch}`))
            this.reportMissingPlatformSupport(osname, arch);
        return `${this.githubDownloadUrl}/wakatime-cli-${osname}-${arch}.zip`;
    }
    reportMissingPlatformSupport(osname, architecture) {
        const url = `https://api.wakatime.com/api/v1/cli-missing?osname=${osname}&architecture=${architecture}&plugin=vscode`;
        const proxy = this.options.getSetting('settings', 'proxy');
        const noSSLVerify = this.options.getSetting('settings', 'no_ssl_verify');
        let options = { url: url };
        if (proxy)
            options['proxy'] = proxy;
        if (noSSLVerify === 'true')
            options['strictSSL'] = false;
        try {
            request.get(options);
        }
        catch (e) { }
    }
    randStr() {
        return (Math.random() + 1).toString(36).substring(7);
    }
}
exports.Dependencies = Dependencies;
