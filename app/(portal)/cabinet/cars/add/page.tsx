import { getActiveModels } from "@/lib/vehicle-catalog";
import { AddCarForm } from "@/components/portal/AddCarForm";

export const dynamic = "force-dynamic";

export default async function AddCarPage(): Promise<React.ReactElement> {
  const models = await getActiveModels();
  const modelNames = models.map((m) => m.name);

  return (
    <div className="max-w-lg">
      <h1 className="text-display text-2xl font-bold mb-6">
        Добавить автомобиль
      </h1>
      <AddCarForm modelNames={modelNames} />
    </div>
  );
}
