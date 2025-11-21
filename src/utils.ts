import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import { StdioOptions } from 'child_process';
import { Input, State, TranscriptLog } from './types';
import path from 'path';
import { logger } from './logger';

const STATE_FILE = path.join(os.homedir(), '.wakatime', 'claude-code.json');

export function parseInput() {
  try {
    const stdinData = fs.readFileSync(0, 'utf-8');
    if (stdinData.trim()) {
      const input: Input = JSON.parse(stdinData);
      return input;
    }
  } catch (err) {
    console.error(err);
  }
  return undefined;
}

export function shouldSendHeartbeat(inp?: Input): boolean {
  if (inp?.hook_event_name === 'Stop') {
    return true;
  }

  try {
    const last = (JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as State).lastHeartbeatAt ?? timestamp();
    return timestamp() - last >= 60;
  } catch {
    return true;
  }
}

export function updateState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastHeartbeatAt: timestamp() } as State, null, 2));
}

export function getEntityFiles(inp: Input | undefined): { entities: Map<string, number>; claudeVersion: string } {
  const entities = new Map<string, number>();
  let claudeVersion = '';

  const transcriptPath = inp?.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { entities, claudeVersion };
  }

  const lastHeartbeatAt = getLastHeartbeat();

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  for (const logLine of content.split('\n')) {
    if (!logLine.trim()) continue;

    try {
      const log = JSON.parse(logLine) as TranscriptLog;
      if (!log.timestamp) continue;

      if (log.version) claudeVersion = log.version;

      const timestamp = new Date(log.timestamp).getTime() / 1000;
      if (timestamp < lastHeartbeatAt) continue;

      const filePath = log.toolUseResult?.filePath;
      if (!filePath) continue;

      const patches = log.toolUseResult?.structuredPatch;
      if (!patches) continue;

      const lineChanges = patches.map((patch) => patch.newLines - patch.oldLines).reduce((p, c) => p + c, 0);

      entities.set(filePath, (entities.get(filePath) ?? 0) + lineChanges);
    } catch (err) {
      logger.warnException(err);
    }
  }

  return { entities, claudeVersion };
}

export function formatArguments(binary: string, args: string[]): string {
  let clone = args.slice(0);
  clone.unshift(wrapArg(binary));
  let newCmds: string[] = [];
  let lastCmd = '';
  for (let i = 0; i < clone.length; i++) {
    if (lastCmd == '--key') newCmds.push(wrapArg(obfuscateKey(clone[i])));
    else newCmds.push(wrapArg(clone[i]));
    lastCmd = clone[i];
  }
  return newCmds.join(' ');
}

export function isWindows(): boolean {
  return os.platform() === 'win32';
}

export function getHomeDirectory(): string {
  let home = process.env.WAKATIME_HOME;
  if (home && home.trim() && fs.existsSync(home.trim())) return home.trim();
  return process.env[isWindows() ? 'USERPROFILE' : 'HOME'] || process.cwd();
}

export function buildOptions(stdin?: boolean): Object {
  const options: child_process.ExecFileOptions = {
    windowsHide: true,
  };
  if (stdin) {
    (options as any).stdio = ['pipe', 'pipe', 'pipe'] as StdioOptions;
  }
  if (!isWindows() && !process.env.WAKATIME_HOME && !process.env.HOME) {
    options['env'] = { ...process.env, WAKATIME_HOME: getHomeDirectory() };
  }
  return options;
}

function getLastHeartbeat() {
  try {
    const stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as State;
    return stateData.lastHeartbeatAt ?? 0;
  } catch {
    return 0;
  }
}

function timestamp() {
  return Date.now() / 1000;
}

function wrapArg(arg: string): string {
  if (arg.indexOf(' ') > -1) return '"' + arg.replace(/"/g, '\\"') + '"';
  return arg;
}

function obfuscateKey(key: string): string {
  let newKey = '';
  if (key) {
    newKey = key;
    if (key.length > 4) newKey = 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX' + key.substring(key.length - 4);
  }
  return newKey;
}
