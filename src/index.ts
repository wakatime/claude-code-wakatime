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
    const args: string[] = [
      '--entity',
      'claude code',
      '--entity-type',
      'app',
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

  if (inp?.hook_event_name === 'SessionStart demo') {
    deps.checkAndInstallCli();
  }

  if (shouldSendHeartbeat(inp)) {
    sendHeartbeat(inp);
    updateState();
  }
}

main();
