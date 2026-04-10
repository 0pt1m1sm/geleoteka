"use client";

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export interface BookingData {
  serviceIds: string[];
  serviceNames: string[];
  vin: string;
  model: string;
  year: string;
  mileage: string;
  dateTime: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  loanerCar: boolean;
  waitAtService: boolean;
}

const INITIAL: BookingData = {
  serviceIds: [],
  serviceNames: [],
  vin: "",
  model: "",
  year: "",
  mileage: "",
  dateTime: "",
  name: "",
  phone: "",
  email: "",
  notes: "",
  loanerCar: false,
  waitAtService: false,
};

const STORAGE_KEY = "booking-data";

let bookingListeners: Array<() => void> = [];
let cachedSnapshot: BookingData = INITIAL;
let cachedRaw: string | null = null;

function subscribeBooking(cb: () => void) {
  bookingListeners.push(cb);
  return () => { bookingListeners = bookingListeners.filter((l) => l !== cb); };
}

function getBookingSnapshot(): BookingData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedSnapshot = raw ? JSON.parse(raw) : INITIAL;
    }
  } catch {}
  return cachedSnapshot;
}

function getServerSnapshot(): BookingData {
  return INITIAL;
}

function setBookingStorage(data: BookingData) {
  const raw = JSON.stringify(data);
  cachedRaw = raw;
  cachedSnapshot = data;
  localStorage.setItem(STORAGE_KEY, raw);
  bookingListeners.forEach((l) => l());
}

interface BookingContextValue {
  data: BookingData;
  update: (partial: Partial<BookingData>) => void;
  reset: () => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const data = useSyncExternalStore(subscribeBooking, getBookingSnapshot, getServerSnapshot);

  const update = useCallback((partial: Partial<BookingData>) => {
    const current = getBookingSnapshot();
    setBookingStorage({ ...current, ...partial });
  }, []);

  const reset = useCallback(() => {
    cachedRaw = null;
    cachedSnapshot = INITIAL;
    localStorage.removeItem(STORAGE_KEY);
    bookingListeners.forEach((l) => l());
  }, []);

  return (
    <BookingContext.Provider value={{ data, update, reset }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be inside BookingProvider");
  return ctx;
}
