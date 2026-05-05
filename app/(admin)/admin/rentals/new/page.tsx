import { requireRole } from "@/lib/auth";
import { RentalCarForm } from "@/components/admin/RentalCarForm";

export default async function NewRentalCarPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  return (
    <div className="max-w-lg">
      <h1 className="text-display text-2xl font-bold mb-6">Добавить авто в аренду</h1>
      <RentalCarForm />
    </div>
  );
}
