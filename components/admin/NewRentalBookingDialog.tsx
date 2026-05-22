"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  Button,
  Textarea,
  Alert,
} from "@/components/ui";
import { DateField } from "@/components/rentals/DateField";
import { createRentalBooking } from "@/app/actions/rentals";
import { formatPrice } from "@/lib/utils";
import { toast } from "@/lib/ui/toast";

interface RentalCarOption {
  id: string;
  make: string | null;
  model: string;
  year: number;
  dailyRate: number;
}

interface CustomerHit {
  id: string;
  name: string;
  email: string;
  phone: string;
}

/**
 * Admin: create a rental booking manually on behalf of an EXISTING client.
 * The client picker autofills the contact fields and pins the booking to that
 * customer (createRentalBooking customerUserId), so it never attaches to the
 * logged-in admin.
 */
export function NewRentalBookingDialog({ cars }: { cars: RentalCarOption[] }): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startSubmit] = useTransition();
  const [searching, startSearch] = useTransition();

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [client, setClient] = useState<CustomerHit | null>(null);

  const [carId, setCarId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const car = cars.find((c) => c.id === carId) ?? null;
  const days =
    startDate && endDate
      ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))
      : 0;
  const total = car ? days * car.dailyRate : 0;

  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  })();

  function runSearch(q: string): void {
    setQuery(q);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    startSearch(async () => {
      const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(q.trim())}`);
      const data = (await res.json()) as { results?: CustomerHit[] };
      setHits(data.results ?? []);
    });
  }

  function reset(): void {
    setQuery("");
    setHits([]);
    setClient(null);
    setCarId("");
    setStartDate("");
    setEndDate("");
    setNotes("");
    setError(null);
  }

  function submit(): void {
    setError(null);
    if (!client) return setError("Выберите клиента");
    if (!carId) return setError("Выберите автомобиль");
    if (!startDate || !endDate) return setError("Укажите даты");
    startSubmit(async () => {
      const res = await createRentalBooking({
        carId,
        startDate,
        endDate,
        contactName: client.name,
        contactPhone: client.phone,
        contactEmail: client.email,
        notes,
        customerUserId: client.id,
      });
      if (!res.success) {
        setError(res.error ?? "Не удалось создать бронь");
        return;
      }
      toast.success("Бронь создана");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setOpen(true)}>
        Новая бронь
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая бронь (вручную)</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {/* Client picker */}
            {client ? (
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background-secondary)] px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{client.name}</div>
                  <div className="text-xs text-[var(--foreground-muted)] truncate">
                    {client.phone} · {client.email}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-[var(--color-accent)] hover:underline shrink-0"
                  onClick={() => setClient(null)}
                >
                  Сменить
                </button>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-2">Клиент *</label>
                <div className="flex items-center gap-2">
                  <Search size={14} className="text-[var(--foreground-muted)] shrink-0" aria-hidden />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => runSearch(e.target.value)}
                    placeholder="Поиск по имени, телефону, email (мин. 2 символа)"
                    aria-label="Поиск клиента"
                    className="input flex-1 text-sm"
                  />
                </div>
                {searching ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] py-2">
                    <Loader2 size={12} className="animate-spin" aria-hidden /> Поиск…
                  </div>
                ) : hits.length > 0 ? (
                  <ul className="mt-2 max-h-48 overflow-auto divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)]">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => { setClient(h); setHits([]); setQuery(""); }}
                          className="w-full text-left px-3 py-2 hover:bg-[var(--background-secondary)]"
                        >
                          <div className="text-sm truncate">{h.name}</div>
                          <div className="text-xs text-[var(--foreground-muted)] truncate">{h.phone} · {h.email}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : query.trim().length >= 2 ? (
                  <p className="text-xs text-[var(--foreground-muted)] py-2">Не найдено. Клиент должен существовать — создайте его в разделе «Клиенты».</p>
                ) : null}
              </div>
            )}

            {/* Car */}
            <div>
              <label htmlFor="nb-car" className="block text-sm font-medium mb-2">Автомобиль *</label>
              <select id="nb-car" value={carId} onChange={(e) => setCarId(e.target.value)} className="input w-full">
                <option value="">— выберите —</option>
                {cars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.make ?? "Mercedes-Benz")} {c.model} ({c.year}) — {formatPrice(c.dailyRate)}/дн
                  </option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateField label="С *" value={startDate} onChange={setStartDate} min={minDate} required />
              <DateField label="По *" value={endDate} onChange={setEndDate} min={startDate || minDate} required />
            </div>

            {days > 0 && car ? (
              <div className="rounded-[var(--radius-lg)] bg-[var(--background-secondary)] p-3 text-center text-sm">
                {days} дн. × {formatPrice(car.dailyRate)} ={" "}
                <span className="font-bold text-[var(--color-accent)]">{formatPrice(total)}</span>
              </div>
            ) : null}

            <Textarea label="Комментарий" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Внутренний комментарий" />

            {error ? <Alert variant="error">{error}</Alert> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => { setOpen(false); reset(); }} disabled={pending}>
              Отмена
            </Button>
            <Button type="button" onClick={submit} isLoading={pending} disabled={pending}>
              Создать бронь
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
