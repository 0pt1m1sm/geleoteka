import {
  crmTaskOverdueDedupeKey,
  publishStaffNotificationEvent,
  type StaffNotificationPublishTx,
} from "@/lib/staff-notifications/publish";
import { makeAdminActionUrl } from "@/lib/staff-notifications/safe-action-url";
import { TENANT_KEY } from "@/lib/tenant";

interface OverdueScannerTx extends StaffNotificationPublishTx {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export interface StaffNotificationOverdueScannerDb {
  $transaction<T>(fn: (tx: OverdueScannerTx) => Promise<T>): Promise<T>;
}

interface OverdueTaskRow {
  id: string;
  dueAt: Date;
  ownerUserId: string | null;
  customerUserId: string | null;
  dealId: string | null;
}

export interface ScanOverdueTasksOptions {
  now?: Date;
  limit?: number;
}

export interface ScanOverdueTasksResult {
  scanned: number;
  eventsEnsured: number;
}

/**
 * Lock a bounded set of currently overdue tasks and ensure one immutable event
 * for that exact dueAt. The compound event dedupe key makes overlapping cron
 * passes harmless, while a reschedule creates a distinct overdue occurrence.
 */
export async function scanOverdueCrmTasks(
  client: StaffNotificationOverdueScannerDb,
  options: ScanOverdueTasksOptions = {},
): Promise<ScanOverdueTasksResult> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));

  return client.$transaction(async (tx) => {
    const tasks = await tx.$queryRaw<OverdueTaskRow[]>`
      SELECT task."id", task."dueAt", task."ownerUserId",
             task."customerUserId", task."dealId"
      FROM "CrmTask" task
      WHERE task."status" = 'OPEN'
        AND task."dueAt" <= ${now}
        AND NOT EXISTS (
          SELECT 1
          FROM "StaffNotificationEvent" event
          WHERE event."tenantKey" = ${TENANT_KEY}
            AND event."type" = 'CRM_TASK_OVERDUE'
            AND event."sourceType" = 'CrmTask'
            AND event."sourceId" = task."id"
            AND event."occurredAt" = task."dueAt"
        )
      ORDER BY task."dueAt" ASC, task."id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `;

    for (const task of tasks) {
      await publishStaffNotificationEvent(tx, {
        type: "CRM_TASK_OVERDUE",
        dedupeKey: crmTaskOverdueDedupeKey(task.id, task.dueAt),
        sourceType: "CrmTask",
        sourceId: task.id,
        relatedCustomerUserId: task.customerUserId,
        relatedDealId: task.dealId,
        relatedTaskId: task.id,
        targetUserId: task.ownerUserId,
        safeSummary: "Просрочена задача CRM",
        actionPath: overdueTaskActionPath(task),
        // The occurrence is the deadline crossing, not the later scanner pass.
        // This also makes the Telegram channel cutover suppress old backlog.
        occurredAt: task.dueAt,
      });
    }

    return { scanned: tasks.length, eventsEnsured: tasks.length };
  });
}

function overdueTaskActionPath(task: OverdueTaskRow): string {
  if (task.dealId) {
    return makeAdminActionUrl(
      `/admin/crm/deals/${encodeURIComponent(task.dealId)}`,
    );
  }
  if (task.customerUserId) {
    return makeAdminActionUrl(
      `/admin/customers/${encodeURIComponent(task.customerUserId)}`,
    );
  }
  return makeAdminActionUrl(
    `/admin/crm/tasks#task-${encodeURIComponent(task.id)}`,
  );
}
