import fs from 'fs';
import path from 'path';
import os from 'os';

const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SessionStart'];

function loadSettings(): any {
  if (!fs.existsSync(CLAUDE_SETTINGS)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf-8'));
}

function saveSettings(settings: any): void {
  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
}

function installHooks(): void {
  const settings = loadSettings();
  settings.hooks = settings.hooks || {};

  const hook = {
    matcher: '*',
    hooks: [
      {
        type: 'command',
        command: 'claude-code-wakatime',
      },
    ],
  };

  let hookAlreadyExists = true;
  
  for (const event of HOOK_EVENTS) {
    settings.hooks[event] = settings.hooks[event] || [];
    
    // Check if a hook with the same command already exists
    const existingHook = settings.hooks[event].find((existingHook: any) =>
      existingHook.hooks && 
      Array.isArray(existingHook.hooks) &&
      existingHook.hooks.some((hookItem: any) => 
        hookItem.command === 'claude-code-wakatime'
      )
    );
    
    if (!existingHook) {
      settings.hooks[event].push(hook);
      hookAlreadyExists = false;
    }
  }

  if (hookAlreadyExists) {
    console.log(`WakaTime hooks already installed in Claude ${CLAUDE_SETTINGS}`);
  } else {
    saveSettings(settings);
    console.log(`WakaTime hooks installed in Claude ${CLAUDE_SETTINGS}`);
  }
}

installHooks();
