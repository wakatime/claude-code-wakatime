import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import { StdioOptions } from 'child_process';
import { Input, State } from './types';
import path from 'path';

const STATE_FILE = path.join(os.homedir(), '.wakatime', 'claude-code.json');

export function quote(str: string): string {
  if (str.includes(' ')) return `"${str.replace('"', '\\"')}"`;
  return str;
}

export function apiKeyInvalid(key?: string): string {
  const err = 'Invalid api key... check https://wakatime.com/api-key for your key';
  if (!key) return err;
  const re = new RegExp('^(waka_)?[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$', 'i');
  if (!re.test(key)) return err;
  return '';
}

export function formatDate(date: Date): String {
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

export function obfuscateKey(key: string): string {
  let newKey = '';
  if (key) {
    newKey = key;
    if (key.length > 4) newKey = 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX' + key.substring(key.length - 4);
  }
  return newKey;
}

function wrapArg(arg: string): string {
  if (arg.indexOf(' ') > -1) return '"' + arg.replace(/"/g, '\\"') + '"';
  return arg;
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

export function timestamp() {
  return Date.now() / 1000;
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

export function getLastHeartbeat() {
  try {
    const stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as State;
    return stateData.lastHeartbeatAt ?? 0;
  } catch {
    return 0;
  }
}

export function getModifiedFile(transcriptPath: string): string | undefined {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return undefined;
  }

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n');
  const fileLineChanges = new Map<string, number>();

  const lastHeartbeatAt = getLastHeartbeat();
  for (const line of lines) {
    if (line.trim()) {
      try {
        const logEntry = JSON.parse(line);
        if (!logEntry.timestamp) continue;

        const entryTimestamp = new Date(logEntry.timestamp).getTime() / 1000;
        if (entryTimestamp >= lastHeartbeatAt) {
          let filePath: string | undefined;

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
                filePath = patch.file as string;
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
      } catch {
        // ignore
      }
    }
  }

  if (fileLineChanges.size === 0) {
    return undefined;
  }

  // Find file with most line changes
  let maxChanges = 0;
  let mostChangedFile: string | undefined;
  for (const [file, changes] of fileLineChanges.entries()) {
    if (changes > maxChanges) {
      maxChanges = changes;
      mostChangedFile = file;
    }
  }

  return mostChangedFile;
}

export function calculateLineChanges(transcriptPath: string): number {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      return 0;
    }

    const content = fs.readFileSync(transcriptPath, 'utf-8');
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
        } catch {
          // ignore
        }
      }
    }

    return totalLineChanges;
  } catch {
    return 0;
  }
}
