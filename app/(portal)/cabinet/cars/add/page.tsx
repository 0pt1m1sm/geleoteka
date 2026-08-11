import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getActiveModels } from "@/lib/vehicle-catalog";
import { AddCarForm } from "@/components/portal/AddCarForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AddCarPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const models = await getActiveModels();
  const modelNames = models.map((m) => m.name);

  return (
    <div className="max-w-lg">
      <PageHeader eyebrow="Кабинет" title="Добавить автомобиль" />
      <AddCarForm modelNames={modelNames} />
    </div>
  );
}
