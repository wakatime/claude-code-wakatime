#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { Options } from './options';
import { VERSION } from './version';
import { Dependencies } from './dependencies';
import { Utils } from './utils';
import { Logger, LogLevel } from './logger';

const STATE_FILE = path.join(os.homedir(), '.wakatime', 'claude-code.json');
const WAKATIME_CLI = path.join(os.homedir(), '.wakatime', 'wakatime-cli');

type State = {
  lastHeartbeatAt?: number;
};

type Input = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
};

function shouldSendHeartbeat(): boolean {
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

function updateState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastHeartbeatAt: Utils.timestamp() } as State, null, 2));
}

function sendHeartbeat(inp?: Input) {
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
    execFileSync(WAKATIME_CLI, args);
  } catch (err: any) {
    console.error('Failed to send WakaTime heartbeat:', err.message);
  }
}

function main() {
  const inp = parseInput();

  const options = new Options();
  const debug = options.getSetting('settings', 'debug');
  const logger = new Logger(debug === 'true' ? LogLevel.DEBUG : LogLevel.INFO);
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

  if (shouldSendHeartbeat()) {
    sendHeartbeat(inp);
    updateState();
  }
}

main();
