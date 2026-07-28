/**
 * Minimal ambient declaration for `mailparser`.
 *
 * The package ships no types and there is no `@types/mailparser`, so rather than
 * let the IMAP mapper degrade to `any` we declare only the slice we use:
 * `simpleParser(source) → ParsedMail`. Anything mailparser returns beyond this
 * is intentionally left off — the mapper must not reach for it.
 */
declare module "mailparser" {
  export interface AddressObjectValue {
    address?: string;
    name?: string;
    group?: AddressObjectValue[];
  }

  export interface AddressObject {
    value: AddressObjectValue[];
    text?: string;
    html?: string;
  }

  export interface Attachment {
    type: "attachment";
    content: Buffer;
    contentType?: string;
    contentDisposition?: string;
    filename?: string;
    contentId?: string;
    cid?: string;
    related?: boolean;
    size?: number;
    partId?: string;
    checksum?: string;
    headers?: Map<string, unknown>;
  }

  export interface ParsedMail {
    subject?: string;
    from?: AddressObject;
    to?: AddressObject | AddressObject[];
    cc?: AddressObject | AddressObject[];
    bcc?: AddressObject | AddressObject[];
    date?: Date;
    messageId?: string;
    inReplyTo?: string;
    references?: string | string[];
    text?: string;
    html?: string | false;
    textAsHtml?: string;
    headers?: Map<string, unknown>;
    headerLines?: Array<{ key: string; line: string }>;
    attachments: Attachment[];
  }

  export interface SimpleParserOptions {
    skipHtmlToText?: boolean;
    skipTextToHtml?: boolean;
    skipImageLinks?: boolean;
    maxHtmlLengthToParse?: number;
  }

  export function simpleParser(
    source: Buffer | string | NodeJS.ReadableStream,
    options?: SimpleParserOptions,
  ): Promise<ParsedMail>;
}
