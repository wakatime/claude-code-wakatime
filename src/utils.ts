import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import { StdioOptions } from 'child_process';
import { Entity, EntityMap, Input, State, TranscriptLog } from './types';
import { logger } from './logger';

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

function getStateFile(inp: Input): string {
  return `${inp.transcript_path}.wakatime`;
}

export function shouldSendHeartbeat(inp?: Input): boolean {
  if (inp?.hook_event_name === 'Stop') {
    return true;
  }

  if (!inp) return false;

  try {
    const last = (JSON.parse(fs.readFileSync(getStateFile(inp), 'utf-8')) as State).lastHeartbeatAt ?? timestamp();
    return timestamp() - last >= 60;
  } catch {
    return true;
  }
}

export async function updateState(inp?: Input) {
  if (!inp) return;
  const file = getStateFile(inp);
  await fs.promises.writeFile(file, JSON.stringify({ lastHeartbeatAt: timestamp() } as State, null, 2));
}

export async function getEntityFiles(inp: Input | undefined): Promise<{ entities: EntityMap; claudeVersion: string }> {
  const entities = new Map<string, Entity>() as EntityMap;
  let claudeVersion = '';

  const transcriptPath = inp?.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { entities, claudeVersion };
  }

  const lastHeartbeatAt = await getLastHeartbeat(inp);

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

      const patches = log.toolUseResult?.structuredPatch ?? [];

      let lineChanges: number;
      if (patches.length > 0) {
        lineChanges = patches.map((patch) => patch.newLines - patch.oldLines).reduce((p, c) => p + c, 0);
      } else if (log.toolUseResult?.content && !log.toolUseResult?.originalFile) {
        lineChanges = log.toolUseResult.content.split('\n').length;
      } else {
        continue;
      }

      const prevLineChanges = (entities.get(filePath) ?? ({ lineChanges: 0 } as Entity)).lineChanges;
      entities.set(filePath, { lineChanges: prevLineChanges + lineChanges, type: 'file' });
    } catch (err) {
      logger.warnException(err);
    }
  }

  if (inp.hook_event_name == 'UserPromptSubmit' && entities.size === 0) {
    entities.set(inp.cwd, { lineChanges: 0, type: 'app' });
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

async function getLastHeartbeat(inp: Input) {
  try {
    const stateData = JSON.parse(await fs.promises.readFile(getStateFile(inp), 'utf-8')) as State;
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
