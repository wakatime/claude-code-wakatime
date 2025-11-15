"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/install-hooks.ts
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_os = __toESM(require("os"));
var CLAUDE_SETTINGS = import_path.default.join(import_os.default.homedir(), ".claude", "settings.json");
var HOOK_EVENTS = ["PreToolUse", "PostToolUse", "SessionEnd", "UserPromptSubmit", "PreCompact", "SubagentStop", "Stop"];
function loadSettings() {
  if (!import_fs.default.existsSync(CLAUDE_SETTINGS)) {
    return {};
  }
  return JSON.parse(import_fs.default.readFileSync(CLAUDE_SETTINGS, "utf-8"));
}
function saveSettings(settings) {
  import_fs.default.mkdirSync(import_path.default.dirname(CLAUDE_SETTINGS), { recursive: true });
  import_fs.default.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
}
function installHooks() {
  const settings = loadSettings();
  settings.hooks = settings.hooks || {};
  const hook = {
    matcher: "*",
    hooks: [
      {
        type: "command",
        command: "claude-code-wakatime"
      }
    ]
  };
  let hookAlreadyExists = true;
  for (const event of HOOK_EVENTS) {
    settings.hooks[event] = settings.hooks[event] || [];
    const existingHook = settings.hooks[event].find(
      (existingHook2) => existingHook2.hooks && Array.isArray(existingHook2.hooks) && existingHook2.hooks.some((hookItem) => hookItem.command === "claude-code-wakatime")
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
