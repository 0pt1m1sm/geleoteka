export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RentalEditForm } from "@/components/admin/RentalEditForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditRentalCarPage({ params }: Props) {
  const session = await getSession();
  if (!session || (session.permissionRole !== "ADMIN" && session.permissionRole !== "MANAGER")) {
    redirect("/login");
  }

  const { id } = await params;
  const car = await db.vehicle.findFirst({
    where: { id, ownershipType: "RENTAL" },
  });

  if (!car) notFound();

  const c = car as Record<string, unknown>;
  const serialized = {
    id: c.id as string,
    model: c.model as string,
    year: c.year as number,
    dailyRate: (c.dailyRate as number) ?? 0,
    description: (c.description as string) ?? "",
    color: (c.color as string) ?? "",
    plate: (c.plate as string) ?? "",
    mileage: (c.mileage as number) ?? 0,
    engine: (c.engine as string) ?? "",
    horsepower: (c.horsepower as number) ?? 0,
    transmission: (c.transmission as string) ?? "",
    seats: (c.seats as number) ?? 5,
    isAvailable: c.isAvailable as boolean,
    features: ((c.features as string[]) ?? []).join("\n"),
    photos: ((c.photos as string[]) ?? []),
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-display text-2xl font-bold mb-6">
        Редактировать Mercedes-Benz {c.model as string}
      </h1>
      <RentalEditForm car={serialized} />
    </div>
  );
}
