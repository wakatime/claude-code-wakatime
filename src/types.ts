export type State = {
  lastHeartbeatAt?: number;
};

export type HookEvent =
  | 'PreToolUse'
  | 'PermissionRequest'
  | 'PostToolUse'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact'
  | 'SessionStart'
  | 'SessionEnd';

export type Input = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: HookEvent;
};

export type TranscriptLog = {
  parentUuid?: string;
  isSidechain?: boolean;
  userType?: string;
  cwd?: string;
  sessionId?: string;
  version?: string;
  gitBranch?: string;
  type?: string;
  message?: {
    role?: string;
    content?: [
      {
        tool_use_id: string;
        type: string;
        content: string;
      },
    ];
  };
  uuid?: string;
  timestamp?: string;
  toolUseResult: {
    filePath?: string;
    oldString?: string;
    newString?: string;
    content?: string;
    originalFile?: string;
    structuredPatch?: [
      {
        oldStart: number;
        oldLines: number;
        newStart: number;
        newLines: number;
        lines: string[];
      },
    ];
    userModified?: string;
    replaceAll?: string;
  };
};

export type Entity = {
  type: 'file' | 'app';
  lineChanges: number;
};

export type EntityMap = Map<string, Entity>;
