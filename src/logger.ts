import fs from 'fs';
import path from 'path';
import os from 'os';

export enum LogLevel {
  DEBUG = 0,
  INFO,
  WARN,
  ERROR,
}

const LOG_FILE = path.join(os.homedir(), '.wakatime', 'claude-code.log');

export class Logger {
  private level: LogLevel = LogLevel.INFO;

  constructor(level?: LogLevel) {
    if (level !== undefined) this.setLevel(level);
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public log(level: LogLevel, msg: string): void {
    if (level >= this.level) {
      msg = `[${new Date().toISOString()}][${LogLevel[level]}] ${msg}\n`;
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
      fs.appendFileSync(LOG_FILE, msg);
    }
  }

  public debug(msg: string): void {
    this.log(LogLevel.DEBUG, msg);
  }

  public debugException(msg: unknown): void {
    if ((msg as Error).message !== undefined) {
      this.log(LogLevel.DEBUG, (msg as Error).message);
    } else {
      this.log(LogLevel.DEBUG, (msg as Error).toString());
    }
  }

  public info(msg: string): void {
    this.log(LogLevel.INFO, msg);
  }

  public warn(msg: string): void {
    this.log(LogLevel.WARN, msg);
  }

  public warnException(msg: unknown): void {
    if ((msg as Error).message !== undefined) {
      this.log(LogLevel.WARN, (msg as Error).message);
    } else {
      this.log(LogLevel.WARN, (msg as Error).toString());
    }
  }

  public error(msg: string): void {
    this.log(LogLevel.ERROR, msg);
  }

  public errorException(msg: unknown): void {
    if ((msg as Error).message !== undefined) {
      this.log(LogLevel.ERROR, (msg as Error).message);
    } else {
      this.log(LogLevel.ERROR, (msg as Error).toString());
    }
  }
}

const global = globalThis as unknown as {
  logger: Logger | undefined;
};

export const logger = global.logger ?? new Logger();

global.logger = logger;
