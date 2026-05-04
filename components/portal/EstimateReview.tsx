"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/utils";
import { respondToJobLine } from "@/app/actions/estimates";

type JobStatus = "PROPOSED" | "APPROVED" | "DECLINED" | "DEFERRED" | "IN_PROGRESS" | "DONE";

interface LaborLine {
  description: string;
  bookHours: number;
  rate: number;
  total: number;
}

interface PartLine {
  description: string;
  qty: number;
  unitPrice: number;
}

interface JobLine {
  id: string;
  description: string;
  status: JobStatus;
  total: number;
  laborLines: LaborLine[];
  partLines: PartLine[];
}

interface RepairOrderEstimate {
  id: string;
  total: number;
  carModel: string;
  jobs: JobLine[];
}

export function EstimateReview({ repairOrders }: { repairOrders: RepairOrderEstimate[] }) {
  return (
    <div className="space-y-6">
      {repairOrders.map((ro) => (
        <EstimateCard key={ro.id} repairOrder={ro} />
      ))}
    </div>
  );
}

function EstimateCard({ repairOrder }: { repairOrder: RepairOrderEstimate }) {
  const [jobs, setJobs] = useState(repairOrder.jobs);

  const approvedTotal = jobs
    .filter((j) => j.status === "APPROVED")
    .reduce((sum, j) => sum + j.total, 0);

  async function handleResponse(jobId: string, decision: "APPROVED" | "DECLINED" | "DEFERRED") {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: decision } : j))
    );
    await respondToJobLine(jobId, decision);
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Mercedes-Benz {repairOrder.carModel}</h3>
        <p className="text-lg font-bold text-[var(--color-accent)]">
          {formatPrice(approvedTotal)}
        </p>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className={`p-3 rounded-lg transition-colors ${
              job.status === "DECLINED"
                ? "bg-[var(--color-error-bg)] opacity-60"
                : job.status === "APPROVED"
                  ? "bg-[var(--color-success-bg)]"
                  : job.status === "DEFERRED"
                    ? "bg-[var(--color-warning-bg)]"
                    : "bg-[var(--background-secondary)]"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium">{job.description}</p>
                {job.laborLines.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {job.laborLines.map((l, i) => (
                      <p key={i} className="text-xs text-[var(--foreground-muted)]">
                        Работа: {l.bookHours} ч × {formatPrice(l.rate)} = {formatPrice(l.total)}
                      </p>
                    ))}
                  </div>
                )}
                {job.partLines.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {job.partLines.map((p, i) => (
                      <p key={i} className="text-xs text-[var(--foreground-muted)]">
                        Запчасть: {p.description} — {p.qty} × {formatPrice(p.unitPrice)} ={" "}
                        {formatPrice(p.qty * p.unitPrice)}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-sm font-semibold mt-2">Итого: {formatPrice(job.total)}</p>
              </div>

              {job.status === "PROPOSED" && (
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleResponse(job.id, "APPROVED")}
                    className="btn btn-primary text-xs py-1 px-3"
                  >
                    Одобрить
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResponse(job.id, "DEFERRED")}
                    className="btn btn-secondary text-xs py-1 px-3"
                  >
                    Отложить
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResponse(job.id, "DECLINED")}
                    className="text-xs text-[var(--color-error)] hover:underline"
                  >
                    Отклонить
                  </button>
                </div>
              )}

              {job.status === "APPROVED" && (
                <span className="text-xs text-[var(--color-success)] font-medium shrink-0">
                  Одобрено
                </span>
              )}
              {job.status === "DECLINED" && (
                <span className="text-xs text-[var(--color-error)] font-medium line-through shrink-0">
                  Отклонено
                </span>
              )}
              {job.status === "DEFERRED" && (
                <span className="text-xs text-[var(--color-warning)] font-medium shrink-0">
                  Отложено
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
