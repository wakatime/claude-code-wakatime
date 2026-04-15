import adm_zip from 'adm-zip';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { pipeline } from 'stream/promises';
import * as tls from 'tls';
import * as which from 'which';

import { Options } from './options';
import { Logger } from './logger';
import { buildOptions, isWindows } from './utils';

enum osName {
  darwin = 'darwin',
  windows = 'windows',
  linux = 'linux',
}

export class Dependencies {
  private options: Options;
  private logger: Logger;
  private resourcesLocation: string;
  private cliLocation?: string = undefined;
  private cliLocationGlobal?: string = undefined;
  private cliInstalled: boolean = false;
  private githubDownloadUrl = 'https://github.com/wakatime/wakatime-cli/releases/latest/download';
  private githubReleasesUrl = 'https://api.github.com/repos/wakatime/wakatime-cli/releases/latest';
  private legacyOperatingSystems: {
    [key in osName]?: {
      kernelLessThan: string;
      tag: string;
    }[];
  } = {
    [osName.darwin]: [{ kernelLessThan: '17.0.0', tag: 'v1.39.1-alpha.1' }],
  };

  constructor(options: Options, logger: Logger) {
    this.options = options;
    this.logger = logger;
    this.resourcesLocation = options.resourcesLocation;
  }

  private getRequestHeaders(): Record<string, string> {
    return {
      'User-Agent': 'github.com/wakatime/claude-code-wakatime',
    };
  }

  private getProxyAuthorizationHeader(proxyUrl: URL): string | undefined {
    if (!proxyUrl.username && !proxyUrl.password) return;
    return `Basic ${Buffer.from(`${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`).toString('base64')}`;
  }

  private async createProxyTunnel(proxyUrl: URL, targetUrl: URL, rejectUnauthorized: boolean): Promise<net.Socket> {
    const proxyPort = proxyUrl.port ? parseInt(proxyUrl.port, 10) : proxyUrl.protocol === 'https:' ? 443 : 80;
    const baseSocket =
      proxyUrl.protocol === 'https:'
        ? tls.connect({
            host: proxyUrl.hostname,
            port: proxyPort,
            rejectUnauthorized,
            servername: proxyUrl.hostname,
          })
        : net.connect(proxyPort, proxyUrl.hostname);

    return new Promise<net.Socket>((resolve, reject) => {
      const auth = this.getProxyAuthorizationHeader(proxyUrl);

      const cleanup = () => {
        baseSocket.removeListener('error', onError);
        baseSocket.removeListener('data', onData);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      let response = '';
      const onData = (chunk: Buffer) => {
        response += chunk.toString('utf8');
        if (!response.includes('\r\n\r\n')) return;

        cleanup();
        const statusLine = response.split('\r\n', 1)[0];
        if (!statusLine.includes(' 200 ')) {
          baseSocket.destroy();
          reject(new Error(`Proxy CONNECT failed: ${statusLine}`));
          return;
        }

        resolve(baseSocket);
      };

      const connectRequest = `CONNECT ${targetUrl.hostname}:${targetUrl.port || 443} HTTP/1.1\r\nHost: ${targetUrl.hostname}:${targetUrl.port || 443}\r\n${auth ? `Proxy-Authorization: ${auth}\r\n` : ''}Connection: close\r\n\r\n`;

      baseSocket.once('error', onError);
      baseSocket.on('data', onData);
      if (proxyUrl.protocol === 'https:') {
        baseSocket.once('secureConnect', () => {
          baseSocket.write(connectRequest);
        });
      } else {
        baseSocket.once('connect', () => {
          baseSocket.write(connectRequest);
        });
      }
    });
  }

  private async sendRequest(url: string, options?: { headers?: Record<string, string>; proxy?: string; noSSLVerify?: boolean }): Promise<http.IncomingMessage> {
    const targetUrl = new URL(url);
    const proxy = options?.proxy ? new URL(options.proxy) : undefined;
    const headers = { ...options?.headers };
    const rejectUnauthorized = !options?.noSSLVerify;

    return new Promise<http.IncomingMessage>(async (resolve, reject) => {
      let req: http.ClientRequest | undefined;
      try {
        if (proxy) {
          this.logger.debug(`Using Proxy: ${proxy.toString()}`);
        }

        if (proxy && targetUrl.protocol === 'https:') {
          const tunnel = await this.createProxyTunnel(proxy, targetUrl, rejectUnauthorized);
          const secureSocket = tls.connect({
            socket: tunnel,
            servername: targetUrl.hostname,
            rejectUnauthorized,
          });
          secureSocket.once('error', reject);
          req = https.request(
            {
              host: targetUrl.hostname,
              port: targetUrl.port ? parseInt(targetUrl.port, 10) : 443,
              path: `${targetUrl.pathname}${targetUrl.search}`,
              method: 'GET',
              headers,
              agent: false,
              createConnection: () => secureSocket,
            },
            (response) => resolve(response),
          );
        } else {
          const isHttpsRequest = proxy ? proxy.protocol === 'https:' : targetUrl.protocol === 'https:';
          const requestModule = isHttpsRequest ? https : http;
          const requestUrl = proxy ?? targetUrl;
          const requestOptions: https.RequestOptions = {
            host: requestUrl.hostname,
            port: requestUrl.port ? parseInt(requestUrl.port, 10) : isHttpsRequest ? 443 : 80,
            path: proxy ? targetUrl.toString() : `${targetUrl.pathname}${targetUrl.search}`,
            method: 'GET',
            headers: proxy
              ? {
                  Host: targetUrl.host,
                  ...headers,
                  ...(this.getProxyAuthorizationHeader(proxy) ? { 'Proxy-Authorization': this.getProxyAuthorizationHeader(proxy)! } : {}),
                }
              : headers,
          };

          if (isHttpsRequest) {
            requestOptions.rejectUnauthorized = rejectUnauthorized;
            requestOptions.servername = requestUrl.hostname;
          }

          req = requestModule.request(requestOptions, (response) => resolve(response));
        }

        req.once('error', reject);
        req.end();
      } catch (error) {
        req?.destroy();
        reject(error);
      }
    });
  }

  private async requestWithRedirects(
    url: string,
    options?: { headers?: Record<string, string>; proxy?: string; noSSLVerify?: boolean },
    redirectsLeft = 5,
  ): Promise<http.IncomingMessage> {
    const response = await this.sendRequest(url, options);
    const statusCode = response.statusCode ?? 0;
    const location = response.headers.location;

    if (statusCode >= 300 && statusCode < 400 && location && redirectsLeft > 0) {
      response.resume();
      const nextUrl = new URL(location, url).toString();
      return this.requestWithRedirects(nextUrl, options, redirectsLeft - 1);
    }

    return response;
  }

  private async getJson(
    url: string,
    options?: { headers?: Record<string, string>; proxy?: string; noSSLVerify?: boolean },
  ): Promise<{ statusCode: number; body: any }> {
    const response = await this.requestWithRedirects(url, options);
    const statusCode = response.statusCode ?? 0;
    const chunks: Buffer[] = [];

    for await (const chunk of response) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    return {
      statusCode,
      body: bodyText ? JSON.parse(bodyText) : {},
    };
  }

  private async downloadToFile(
    url: string,
    outputFile: string,
    options?: { headers?: Record<string, string>; proxy?: string; noSSLVerify?: boolean },
  ): Promise<void> {
    const response = await this.requestWithRedirects(url, options);
    const statusCode = response.statusCode ?? 0;
    if (statusCode < 200 || statusCode >= 300) {
      response.resume();
      throw new Error(`Unexpected status code ${statusCode}`);
    }

    await pipeline(response, fs.createWriteStream(outputFile));
  }

  public getCliLocation(): string {
    if (this.cliLocation) return this.cliLocation;

    this.cliLocation = this.getCliLocationGlobal();
    if (this.cliLocation) return this.cliLocation;

    const osname = this.osName();
    const arch = this.architecture();
    const ext = isWindows() ? '.exe' : '';
    const binary = `wakatime-cli-${osname}-${arch}${ext}`;
    this.cliLocation = path.join(this.resourcesLocation, binary);

    return this.cliLocation;
  }

  public getCliLocationGlobal(): string | undefined {
    if (this.cliLocationGlobal) return this.cliLocationGlobal;

    const binaryName = `wakatime-cli${isWindows() ? '.exe' : ''}`;
    const path = which.sync(binaryName, { nothrow: true });
    if (path) {
      this.cliLocationGlobal = path;
      this.logger.debug(`Using global wakatime-cli location: ${path}`);
    }

    return this.cliLocationGlobal;
  }

  public isCliInstalled(): boolean {
    if (this.cliInstalled) return true;
    this.cliInstalled = fs.existsSync(this.getCliLocation());
    return this.cliInstalled;
  }

  public checkAndInstallCli(callback?: () => void): void {
    if (!this.isCliInstalled()) {
      this.installCli(callback ?? (() => {}));
    } else {
      this.isCliLatest((isLatest) => {
        if (!isLatest) {
          this.installCli(callback ?? (() => {}));
        } else {
          callback?.();
        }
      });
    }
  }

  private isCliLatest(callback: (arg0: boolean) => void): void {
    if (this.getCliLocationGlobal()) {
      callback(true);
      return;
    }

    let args = ['--version'];
    const options = buildOptions();
    try {
      child_process.execFile(this.getCliLocation(), args, options, (error, _stdout, stderr) => {
        if (!error) {
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
            } else if (latestVersion) {
              this.logger.debug(`Found an updated wakatime-cli ${latestVersion}`);
              callback(false);
            } else {
              this.logger.debug('Unable to find latest wakatime-cli version');
              callback(false);
            }
          });
        } else {
          callback(false);
        }
      });
    } catch (e) {
      callback(false);
    }
  }

  private getLatestCliVersion(callback: (arg0: string) => void): void {
    const proxy = this.options.getSetting('settings', 'proxy');
    const noSSLVerify = this.options.getSetting('settings', 'no_ssl_verify');
    this.logger.debug(`Fetching latest wakatime-cli version from GitHub API: ${this.githubReleasesUrl}`);

    this.getJson(this.githubReleasesUrl, {
      headers: this.getRequestHeaders(),
      proxy: proxy ?? undefined,
      noSSLVerify: noSSLVerify === 'true',
    })
      .then(({ statusCode, body }) => {
        if (statusCode == 200) {
          this.logger.debug(`GitHub API Response ${statusCode}`);
          const latestCliVersion = body['tag_name'];
          this.logger.debug(`Latest wakatime-cli version from GitHub: ${latestCliVersion}`);
          this.options.setSetting('internal', 'cli_version_last_accessed', String(Math.round(Date.now() / 1000)), true);
          callback(latestCliVersion);
        } else {
          this.logger.warn(`GitHub API Response ${statusCode}`);
          callback('');
        }
      })
      .catch((e) => {
        this.logger.warn(`GitHub API Response Error: ${e}`);
        callback('');
      });
  }

  private installCli(callback: () => void): void {
    this.logger.debug(`Downloading wakatime-cli from GitHub...`);
    const url = this.cliDownloadUrl();
    let zipFile = path.join(this.resourcesLocation, 'wakatime-cli' + this.randStr() + '.zip');
    this.downloadFile(
      url,
      zipFile,
      () => {
        this.extractCli(zipFile, callback);
      },
      callback,
    );
  }

  private isSymlink(file: string): boolean {
    try {
      return fs.lstatSync(file).isSymbolicLink();
    } catch (_) {}
    return false;
  }

  private extractCli(zipFile: string, callback: () => void): void {
    this.logger.debug(`Extracting wakatime-cli into "${this.resourcesLocation}"...`);
    this.backupCli();
    this.unzip(zipFile, this.resourcesLocation, (unzipped) => {
      if (!unzipped) {
        this.restoreCli();
      } else if (!isWindows()) {
        this.removeCli();
        const cli = this.getCliLocation();
        try {
          this.logger.debug('Chmod 755 wakatime-cli...');
          fs.chmodSync(cli, 0o755);
        } catch (e) {
          this.logger.warnException(e);
        }
        const ext = isWindows() ? '.exe' : '';
        const link = path.join(this.resourcesLocation, `wakatime-cli${ext}`);
        if (!this.isSymlink(link)) {
          try {
            this.logger.debug(`Create symlink from wakatime-cli to ${cli}`);
            fs.symlinkSync(cli, link);
          } catch (e) {
            this.logger.warnException(e);
            try {
              fs.copyFileSync(cli, link);
              fs.chmodSync(link, 0o755);
            } catch (e2) {
              this.logger.warnException(e2);
            }
          }
        }
      }
      this.logger.debug('Finished extracting wakatime-cli.');
      callback();
    });
  }

  private backupCli() {
    if (fs.existsSync(this.getCliLocation())) {
      fs.renameSync(this.getCliLocation(), `${this.getCliLocation()}.backup`);
    }
  }

  private restoreCli() {
    const backup = `${this.getCliLocation()}.backup`;
    if (fs.existsSync(backup)) {
      fs.renameSync(backup, this.getCliLocation());
    }
  }

  private removeCli() {
    const backup = `${this.getCliLocation()}.backup`;
    if (fs.existsSync(backup)) {
      fs.unlinkSync(backup);
    }
  }

  private downloadFile(url: string, outputFile: string, callback: () => void, error: () => void): void {
    const proxy = this.options.getSetting('settings', 'proxy');
    const noSSLVerify = this.options.getSetting('settings', 'no_ssl_verify');
    this.downloadToFile(url, outputFile, {
      headers: this.getRequestHeaders(),
      proxy: proxy ?? undefined,
      noSSLVerify: noSSLVerify === 'true',
    })
      .then(() => {
        callback();
      })
      .catch((e) => {
        this.logger.warn(`Failed to download ${url}`);
        this.logger.warn(e.toString());
        error();
      });
  }

  private unzip(file: string, outputDir: string, callback: (unzipped: boolean) => void): void {
    if (fs.existsSync(file)) {
      try {
        let zip = new adm_zip(file);
        zip.extractAllTo(outputDir, true);
        fs.unlinkSync(file);
        callback(true);
        return;
      } catch (e) {
        this.logger.warnException(e);
      }
      try {
        fs.unlinkSync(file);
      } catch (e2) {
        this.logger.warnException(e2);
      }
      callback(false);
    }
  }

  private legacyReleaseTag() {
    const osname = this.osName() as osName;
    const legacyOS = this.legacyOperatingSystems[osname];
    if (!legacyOS) return;
    const version = legacyOS.find((spec) => {
      try {
        return semver.lt(os.release(), spec.kernelLessThan);
      } catch (e) {
        return false;
      }
    });
    return version?.tag;
  }

  private architecture(): string {
    const arch = os.arch();
    if (arch.indexOf('32') > -1) return '386';
    if (arch.indexOf('x64') > -1) return 'amd64';
    return arch;
  }

  private osName(): string {
    let osname = os.platform() as string;
    if (osname == 'win32') osname = 'windows';
    return osname;
  }

  private cliDownloadUrl(): string {
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
    if (!validCombinations.includes(`${osname}-${arch}`)) this.reportMissingPlatformSupport(osname, arch);

    return `${this.githubDownloadUrl}/wakatime-cli-${osname}-${arch}.zip`;
  }

  private reportMissingPlatformSupport(osname: string, architecture: string): void {
    const url = `https://api.wakatime.com/api/v1/cli-missing?osname=${osname}&architecture=${architecture}&plugin=claude-code`;
    const proxy = this.options.getSetting('settings', 'proxy');
    const noSSLVerify = this.options.getSetting('settings', 'no_ssl_verify');
    this.requestWithRedirects(url, {
      headers: this.getRequestHeaders(),
      proxy: proxy ?? undefined,
      noSSLVerify: noSSLVerify === 'true',
    })
      .then((response) => {
        response.resume();
      })
      .catch(() => {});
  }

  private randStr(): string {
    return (Math.random() + 1).toString(36).substring(7);
  }
}
