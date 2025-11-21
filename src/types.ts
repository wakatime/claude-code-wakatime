export type State = {
  lastHeartbeatAt?: number;
};

export type Input = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
};
