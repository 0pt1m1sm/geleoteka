const TELEGRAM_START_COMMAND = "/start";
const TELEGRAM_START_COMMAND_MAX_LENGTH = 200;
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
  if (command.length > TELEGRAM_START_COMMAND_MAX_LENGTH) return null;

  const normalizedCommand = command.trim();
  let offset = 0;
  let isAddressed = false;

  if (normalizedCommand.startsWith("@")) {
    const usernameEnd = readBotUsernameEnd(normalizedCommand, 1);
    if (usernameEnd === null || !isWhitespace(normalizedCommand[usernameEnd])) {
      return null;
    }
    offset = skipWhitespace(normalizedCommand, usernameEnd);
    isAddressed = true;
  }

  if (!normalizedCommand.startsWith(TELEGRAM_START_COMMAND, offset)) {
    return null;
  }
  offset += TELEGRAM_START_COMMAND.length;

  if (normalizedCommand[offset] === "@") {
    const usernameEnd = readBotUsernameEnd(normalizedCommand, offset + 1);
    if (usernameEnd === null) return null;
    offset = usernameEnd;
    isAddressed = true;
  }

  if (offset === normalizedCommand.length) {
    return { rawLinkToken: null, isAddressed, isBare: true };
  }
  if (!isWhitespace(normalizedCommand[offset])) return null;

  const rawLinkToken = normalizedCommand.slice(
    skipWhitespace(normalizedCommand, offset),
  );

  return {
    rawLinkToken: TELEGRAM_LINK_TOKEN_PATTERN.test(rawLinkToken)
      ? rawLinkToken
      : null,
    isAddressed,
    isBare: false,
  };
}

function readBotUsernameEnd(command: string, start: number): number | null {
  let offset = start;
  while (
    offset < command.length &&
    isBotUsernameCharacter(command.charCodeAt(offset))
  ) {
    offset += 1;
  }
  return offset === start ? null : offset;
}

function isBotUsernameCharacter(characterCode: number): boolean {
  return (
    (characterCode >= 48 && characterCode <= 57) ||
    (characterCode >= 65 && characterCode <= 90) ||
    characterCode === 95 ||
    (characterCode >= 97 && characterCode <= 122)
  );
}

function skipWhitespace(command: string, start: number): number {
  let offset = start;
  while (offset < command.length && isWhitespace(command[offset])) {
    offset += 1;
  }
  return offset;
}

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && character.trim() === "";
}
