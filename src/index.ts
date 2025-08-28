#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { Options } from './options';
import { VERSION } from './version';
import { Dependencies } from './dependencies';
import { Utils } from './utils';
import { Logger, LogLevel } from './logger';

const STATE_FILE = path.join(os.homedir(), '.wakatime', 'claude-code.json');
const WAKATIME_CLI = path.join(os.homedir(), '.wakatime', 'wakatime-cli');
const logger = new Logger();

type State = {
  lastHeartbeatAt?: number;
};

type Input = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
};

function shouldSendHeartbeat(inp?: Input): boolean {
  if (inp?.hook_event_name === 'Stop') {
    return true;
  }

  try {
    const last = (JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as State).lastHeartbeatAt ?? Utils.timestamp();
    return Utils.timestamp() - last >= 60;
  } catch {
    return true;
  }
}

function parseInput() {
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

function getLastHeartbeat() {
  try {
    const stateData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as State;
    return stateData.lastHeartbeatAt ?? 0;
  } catch {
    return 0;
  }
}

function getModifiedFile(transcriptPath: string): string | undefined {
  try {
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
  } catch {
    return undefined;
  }
}

function calculateLineChanges(transcriptPath: string): number {
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

function updateState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastHeartbeatAt: Utils.timestamp() } as State, null, 2));
}

function sendHeartbeat(inp: Input | undefined) {
  const projectFolder = inp?.cwd;
  try {
    let entity = 'claude code';
    if (inp?.transcript_path) {
      const modifiedFile = getModifiedFile(inp.transcript_path);
      if (modifiedFile) {
        entity = modifiedFile;
      }
    }

    const args: string[] = [
      '--entity',
      entity,
      '--entity-type',
      entity === 'claude code' ? 'app' : 'file',
      '--category',
      'ai coding',
      '--plugin',
      `claude-code-wakatime/${VERSION}`,
    ];
    if (projectFolder) {
      args.push('--project-folder');
      args.push(projectFolder);
    }

    if (inp?.transcript_path) {
      const lineChanges = calculateLineChanges(inp.transcript_path);
      if (lineChanges) {
        args.push('--ai-line-changes');
        args.push(lineChanges.toString());
      }
    }

    const options = Utils.buildOptions();
    execFile(WAKATIME_CLI, args, options, (error, _stdout, stderr) => {
      const output = _stdout.toString().trim() + stderr.toString().trim();
      if (output) {
        logger.error(output);
      }
      if (!(error != null)) {
        logger.debug(`Sending heartbeat: ${args}`);
      }
    });
  } catch (err: any) {
    logger.errorException(err);
  }
}

function main() {
  const inp = parseInput();

  const options = new Options();
  const debug = options.getSetting('settings', 'debug');
  logger.setLevel(debug === 'true' ? LogLevel.DEBUG : LogLevel.INFO);
  const deps = new Dependencies(options, logger);

  if (inp) {
    try {
      logger.debug(JSON.stringify(inp, null, 2));
    } catch (err) {
      // ignore
    }
  }

  if (inp?.hook_event_name === 'SessionStart') {
    deps.checkAndInstallCli();
  }

  if (shouldSendHeartbeat(inp)) {
    sendHeartbeat(inp);
    updateState();
  }
}

main();
