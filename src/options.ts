import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { Utils } from './utils';

export interface Setting {
  key: string;
  value: string;
  error?: string;
}

export class Options {
  private configFile: string;
  private internalConfigFile: string;
  private resourcesLocation: string;
  private logFile: string;

  constructor() {
    const home = Utils.getHomeDirectory();
    const wakaFolder = path.join(home, '.wakatime');
    try {
      if (!fs.existsSync(wakaFolder)) {
        fs.mkdirSync(wakaFolder, { recursive: true });
      }
      this.resourcesLocation = wakaFolder;
    } catch (e) {
      console.error(e);
      throw e;
    }

    this.configFile = path.join(home, '.wakatime.cfg');
    this.internalConfigFile = path.join(this.resourcesLocation, 'wakatime-internal.cfg');
    this.logFile = path.join(this.resourcesLocation, 'wakatime.log');
  }

  public getSetting(section: string, key: string, internal?: boolean): string | undefined {
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
        } else if (currentSection === section) {
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

  public setSetting(section: string, key: string, val: string, internal: boolean): void {
    const configFile = this.getConfigFile(internal);
    fs.readFile(configFile, 'utf-8', (err: NodeJS.ErrnoException | null, content: string) => {
      // ignore errors because config file might not exist yet
      if (err) content = '';

      let contents: string[] = [];
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
        } else if (currentSection === section) {
          let parts = line.split('=');
          let currentKey = parts[0].trim();
          if (currentKey === key) {
            if (!found) {
              contents.push(this.removeNulls(key + ' = ' + val));
              found = true;
            }
          } else {
            contents.push(this.removeNulls(line));
          }
        } else {
          contents.push(this.removeNulls(line));
        }
      }

      if (!found) {
        if (currentSection !== section) {
          contents.push('[' + section + ']');
        }
        contents.push(this.removeNulls(key + ' = ' + val));
      }

      fs.writeFile(configFile as string, contents.join('\n'), (err) => {
        if (err) throw err;
      });
    });
  }

  public setSettings(section: string, settings: Setting[], internal: boolean): void {
    const configFile = this.getConfigFile(internal);
    fs.readFile(configFile, 'utf-8', (err: NodeJS.ErrnoException | null, content: string) => {
      // ignore errors because config file might not exist yet
      if (err) content = '';

      let contents: string[] = [];
      let currentSection = '';

      const found: Record<string, boolean> = {};
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
        } else if (currentSection === section) {
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
        } else {
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

      fs.writeFile(configFile as string, contents.join('\n'), (err) => {
        if (err) throw err;
      });
    });
  }

  public getConfigFile(internal: boolean): string {
    return internal ? this.internalConfigFile : this.configFile;
  }

  public getLogFile(): string {
    return this.logFile;
  }

  private startsWith(outer: string, inner: string): boolean {
    return outer.slice(0, inner.length) === inner;
  }

  private endsWith(outer: string, inner: string): boolean {
    return inner === '' || outer.slice(-inner.length) === inner;
  }

  private removeNulls(s: string): string {
    return s.replace(/\0/g, '');
  }
}
