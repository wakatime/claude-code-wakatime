#!/usr/bin/env node

import { execFile } from 'child_process';
import { Options } from './options';
import { VERSION } from './version';
import { Dependencies } from './dependencies';
import { Logger, LogLevel } from './logger';
import { Input } from './types';
import { buildOptions, calculateLineChanges, getModifiedFile, parseInput, shouldSendHeartbeat, timestamp, updateState } from './utils';

const logger = new Logger();
const options = new Options();
const deps = new Dependencies(options, logger);

function getEntityFile(inp: Input | undefined): string | undefined {
  if (!inp?.transcript_path) return;
  return getModifiedFile(inp.transcript_path);
}

function sendHeartbeat(inp: Input | undefined) {
  const projectFolder = inp?.cwd;
  logger.debug(`Project folder: ${projectFolder}`);
  logger.debug('Getting entity...');
  const entity = getEntityFile(inp);
  logger.debug(`Entity: ${entity}`);
  if (!entity) return;

  const wakatime_cli = deps.getCliLocation();

  const args: string[] = [
    '--entity',
    entity,
    '--entity-type',
    'file',
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

  logger.debug(`Sending heartbeat: ${wakatime_cli} ${args}`);

  const execOptions = buildOptions();
  execFile(wakatime_cli, args, execOptions, (error, stdout, stderr) => {
    const output = stdout.toString().trim() + stderr.toString().trim();
    if (output) logger.error(output);
    if (error) logger.error(error.toString());
  });
}

function main() {
  const inp = parseInput();

  const debug = options.getSetting('settings', 'debug');
  logger.setLevel(debug === 'true' ? LogLevel.DEBUG : LogLevel.INFO);

  try {
    if (inp) logger.debug(JSON.stringify(inp, null, 2));

    deps.checkAndInstallCli();

    if (shouldSendHeartbeat(inp)) {
      logger.debug('Sending heartbeat...');
      sendHeartbeat(inp);
      updateState();
    } else {
      logger.debug('Skip sending heartbeat');
    }
  } catch (err) {
    logger.errorException(err);
  }
}

main();
