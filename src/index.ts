#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const STATE_FILE = path.join(os.homedir(), '.wakatime', 'claude-code.json');
const WAKATIME_CLI = path.join(os.homedir(), '.wakatime', 'wakatime-cli');

type State = {
  lastHeartbeatAt?: number;
};

function timestamp() {
  return Date.now() / 1000;
}

function shouldSendHeartbeat(): boolean {
  try {
    const last = (JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as State).lastHeartbeatAt ?? timestamp();
    return timestamp() - last >= 60;
  } catch {
    return true;
  }
}

function updateState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastHeartbeatAt: timestamp() } as State, null, 2));
}

function sendHeartbeat() {
  try {
    execFileSync(WAKATIME_CLI, ['--entity', 'claude code', '--entity-type', 'app', '--category', 'ai coding']);
  } catch (err: any) {
    console.error('Failed to send WakaTime heartbeat:', err.message);
  }
}

if (shouldSendHeartbeat()) {
  sendHeartbeat();
  updateState();
}
