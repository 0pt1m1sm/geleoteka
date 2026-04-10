import { BookingProvider } from "@/components/booking/BookingProvider";

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BookingProvider>{children}</BookingProvider>;
}
