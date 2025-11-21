#!/usr/bin/env node

import { execFile } from 'child_process';
import { Options } from './options';
import { VERSION } from './version';
import { Dependencies } from './dependencies';
import { logger, Logger, LogLevel } from './logger';
import { Input } from './types';
import { buildOptions, formatArguments, getEntityFiles, parseInput, shouldSendHeartbeat, updateState } from './utils';

const options = new Options();
const deps = new Dependencies(options, logger);

function sendHeartbeat(inp: Input | undefined): boolean {
  const projectFolder = inp?.cwd;
  const { entities, claudeVersion } = getEntityFiles(inp);
  logger.debug(`Entities: ${entities}`);
  if (entities.size === 0) return false;

  const wakatime_cli = deps.getCliLocation();

  for (const [entity, lineChanges] of entities.entries()) {
    const args: string[] = [
      '--entity',
      entity,
      '--entity-type',
      'file',
      '--category',
      'ai coding',
      '--plugin',
      `claude/${claudeVersion} claude-code-wakatime/${VERSION}`,
    ];
    if (projectFolder) {
      args.push('--project-folder');
      args.push(projectFolder);
    }

    if (lineChanges) {
      args.push('--ai-line-changes');
      args.push(lineChanges.toString());
    }

    logger.debug(`Sending heartbeat: ${formatArguments(wakatime_cli, args)}`);

    const execOptions = buildOptions();
    execFile(wakatime_cli, args, execOptions, (error, stdout, stderr) => {
      const output = stdout.toString().trim() + stderr.toString().trim();
      if (output) logger.error(output);
      if (error) logger.error(error.toString());
    });
  }

  return true;
}

function main() {
  const inp = parseInput();

  const debug = options.getSetting('settings', 'debug');
  logger.setLevel(debug === 'true' ? LogLevel.DEBUG : LogLevel.INFO);

  try {
    if (inp) logger.debug(JSON.stringify(inp, null, 2));

    deps.checkAndInstallCli();

    if (shouldSendHeartbeat(inp)) {
      if (sendHeartbeat(inp)) {
        updateState();
      }
    }
  } catch (err) {
    logger.errorException(err);
  }
}

main();
