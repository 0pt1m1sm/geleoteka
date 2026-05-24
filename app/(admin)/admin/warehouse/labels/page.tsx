export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatScanCode } from "@/lib/wms/public";
import { LabelSheetControls } from "@/components/admin/LabelSheetControls";

interface Props {
  searchParams: Promise<{ part?: string; loc?: string }>;
}

interface LabelCard {
  qr: string;
  title: string;
  sub: string;
}

function parseCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function qr(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { margin: 1, width: 220 });
}

export default async function WarehouseLabelsPage({ searchParams }: Props): Promise<React.ReactElement> {
  const session = await getSession();
  if (
    !session ||
    (session.permissionRole !== "ADMIN" &&
      session.permissionRole !== "MANAGER" &&
      session.permissionRole !== "WAREHOUSE_WORKER")
  ) {
    redirect("/login");
  }

  const { part, loc } = await searchParams;
  const partIds = parseCsv(part);
  const locations = parseCsv(loc).map((l) => l.toUpperCase());

  const labels: LabelCard[] = [];

  if (partIds.length > 0) {
    const parts = (await db.part.findMany({
      where: { id: { in: partIds } },
      select: { id: true, name: true, article: true, stockItem: { select: { barcode: true } } },
    })) as Array<{ id: string; name: string; article: string; stockItem: { barcode: string | null } | null }>;
    const byId = new Map(parts.map((p) => [p.id, p]));
    for (const id of partIds) {
      const p = byId.get(id);
      if (!p) continue;
      // QR encodes the typed re-scannable code (barcode if present, else article);
      // the caption stays the human-readable code.
      const code = p.stockItem?.barcode ?? p.article;
      labels.push({ qr: await qr(formatScanCode("PART", code)), title: p.name, sub: code });
    }
  }

  for (const location of locations) {
    labels.push({ qr: await qr(formatScanCode("LOC", location)), title: location, sub: "Ячейка" });
  }

  return (
    <div>
      <Link
        href="/admin/warehouse"
        className="mb-2 inline-flex w-fit items-center gap-1 py-1 text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--color-accent)] print:hidden"
      >
        <span aria-hidden="true">←</span>
        Склад
      </Link>
      <h1 className="text-display text-2xl font-bold mb-4 print:hidden">Печать этикеток</h1>
      <LabelSheetControls />

      {labels.length === 0 ? (
        <p className="text-[var(--foreground-muted)] print:hidden">
          Нет этикеток. Откройте со списком позиций (?part=…) или добавьте ячейки выше.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
          {labels.map((lb, i) => (
            <div
              key={`${lb.sub}-${i}`}
              className="flex break-inside-avoid flex-col items-center rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lb.qr} alt={`QR ${lb.sub}`} width={140} height={140} />
              <p className="mt-2 text-sm font-medium leading-tight">{lb.title}</p>
              <p className="font-mono text-xs text-[var(--foreground-muted)]">{lb.sub}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
