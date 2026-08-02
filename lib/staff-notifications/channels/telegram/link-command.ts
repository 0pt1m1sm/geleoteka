const TELEGRAM_LINK_COMMAND_PATTERN =
  /^\/start(?:@[A-Za-z0-9_]+)? ([A-Za-z0-9_-]{43})$/;

export function formatTelegramLinkCommand(rawToken: string): string {
  return `/start ${rawToken}`;
}

export function parseTelegramLinkCommand(command: string): string | null {
  return command.match(TELEGRAM_LINK_COMMAND_PATTERN)?.[1] ?? null;
}
