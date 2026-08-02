const TELEGRAM_START_COMMAND_PATTERN =
  /^(?:@([A-Za-z0-9_]+)\s+)?\/start(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]+))?$/;
const TELEGRAM_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface TelegramStartCommand {
  rawLinkToken: string | null;
  isAddressed: boolean;
  isBare: boolean;
}

export function formatTelegramLinkCommand(rawToken: string): string {
  return `/start ${rawToken}`;
}

export function parseTelegramLinkCommand(command: string): string | null {
  return parseTelegramStartCommand(command)?.rawLinkToken ?? null;
}

export function parseTelegramStartCommand(
  command: string,
): TelegramStartCommand | null {
  const match = command.trim().match(TELEGRAM_START_COMMAND_PATTERN);
  if (!match) return null;

  const tail = match[3];
  return {
    rawLinkToken:
      tail && TELEGRAM_LINK_TOKEN_PATTERN.test(tail) ? tail : null,
    isAddressed: Boolean(match[1] || match[2]),
    isBare: tail === undefined,
  };
}
