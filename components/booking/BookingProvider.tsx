"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { createLocalStorageStore } from "@/lib/local-storage-store";

export interface BookingData {
  serviceIds: string[];
  serviceNames: string[];
  vin: string;
  model: string;
  year: string;
  mileage: string;
  /** Trim id captured from the third dropdown. Empty = "Не уверен". */
  trim: string;
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
  trim: "",
  dateTime: "",
  name: "",
  phone: "",
  email: "",
  notes: "",
  loanerCar: false,
  waitAtService: false,
};

const bookingStore = createLocalStorageStore<BookingData>("booking-data", INITIAL);

interface BookingContextValue {
  data: BookingData;
  update: (partial: Partial<BookingData>) => void;
  reset: () => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const data = bookingStore.useStore();

  const update = useCallback((partial: Partial<BookingData>) => {
    bookingStore.setStore({ ...bookingStore.getStore(), ...partial });
  }, []);

  const reset = useCallback(() => {
    bookingStore.setStore(INITIAL);
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
