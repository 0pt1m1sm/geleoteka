import { getActiveModels } from "@/lib/vehicle-catalog";
import { AddCarForm } from "@/components/portal/AddCarForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AddCarPage(): Promise<React.ReactElement> {
  const models = await getActiveModels();
  const modelNames = models.map((m) => m.name);

  return (
    <div className="max-w-lg">
      <PageHeader eyebrow="Кабинет" title="Добавить автомобиль" />
      <AddCarForm modelNames={modelNames} />
    </div>
  );
}
