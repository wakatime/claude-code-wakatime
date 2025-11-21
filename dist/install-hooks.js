"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const CLAUDE_SETTINGS = path_1.default.join(os_1.default.homedir(), '.claude', 'settings.json');
const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'SessionEnd', 'UserPromptSubmit', 'PreCompact', 'SubagentStop', 'Stop'];
function loadSettings() {
    if (!fs_1.default.existsSync(CLAUDE_SETTINGS)) {
        return {};
    }
    return JSON.parse(fs_1.default.readFileSync(CLAUDE_SETTINGS, 'utf-8'));
}
function saveSettings(settings) {
    fs_1.default.mkdirSync(path_1.default.dirname(CLAUDE_SETTINGS), { recursive: true });
    fs_1.default.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
}
function installHooks() {
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
        const existingHook = settings.hooks[event].find((existingHook) => existingHook.hooks &&
            Array.isArray(existingHook.hooks) &&
            existingHook.hooks.some((hookItem) => hookItem.command === 'claude-code-wakatime'));
        if (!existingHook) {
            settings.hooks[event].push(hook);
            hookAlreadyExists = false;
        }
    }
    if (hookAlreadyExists) {
        console.log(`WakaTime hooks already installed in Claude ${CLAUDE_SETTINGS}`);
    }
    else {
        saveSettings(settings);
        console.log(`WakaTime hooks installed in Claude ${CLAUDE_SETTINGS}`);
    }
}
installHooks();
