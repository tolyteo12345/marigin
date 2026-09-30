// Minimal shape of the Telegram Bot API Update object we actually read.
// Fields are filled in by Telegram's servers (not client-supplied), so per
// architecture doc "Telegram long-polling trust boundary" step 2, they are
// trusted as-is — getUpdates is an outbound call authenticated by our own
// bot token, there is no inbound request to verify.
export interface TelegramFrom {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  text?: string;
  from?: TelegramFrom;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}
