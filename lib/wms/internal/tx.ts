import type { DbClientPort } from "./repository";

/** A client able to open an interactive transaction (the base PrismaClient, not
 *  a tx client). The base client's $transaction is overloaded; we only use the
 *  interactive-callback form, so narrow to that single signature for the call. */
export type TxCapable = { $transaction: <T>(fn: (tx: DbClientPort) => Promise<T>) => Promise<T> };

/** True when `client` is a base client that can open its own transaction (vs an
 *  already-open tx client, which has no `$transaction`). Lets a public op
 *  self-wrap when handed the base client and compose when handed a tx. */
export function txCapable(client: DbClientPort): boolean {
  return typeof (client as { $transaction?: unknown }).$transaction === "function";
}
