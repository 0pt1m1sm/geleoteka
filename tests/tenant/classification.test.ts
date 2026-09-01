import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MODEL_CLASSIFICATION,
  modelsNeedingTenantColumn,
  tenantRootOf,
  validateClassification,
} from "@/lib/tenant/model-classification";

/**
 * Сторож классификации.
 *
 * Смысл не в том, чтобы зафиксировать сегодняшний список, а в том, чтобы новая
 * таблица не появилась молча: без арендатора она станет общей для всех
 * сервисов, и обнаружится это на чужих данных.
 *
 * Список моделей читается из самой схемы, а не дублируется здесь: копия
 * разошлась бы с оригиналом в первый же день.
 */
function schemaModels(): string[] {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

describe("классификация моделей относительно арендатора", () => {
  it("в схеме нет ни одной неклассифицированной модели", () => {
    const problems = validateClassification(schemaModels());
    expect(problems, problems.map((p) => `${p.model}: ${p.problem}`).join("\n")).toEqual([]);
  });

  it("схема и классификация покрывают одно и то же множество", () => {
    const inSchema = new Set(schemaModels());
    const classified = new Set(Object.keys(MODEL_CLASSIFICATION));
    expect(inSchema.size).toBe(classified.size);
  });

  it("каждая дочерняя модель приводит к корню-арендатору", () => {
    // Цепочка родителей обязана заканчиваться на TENANT: иначе строка
    // наследует аренду у таблицы, у которой её нет.
    for (const [model, entry] of Object.entries(MODEL_CLASSIFICATION)) {
      if (entry.kind !== "TENANT_CHILD") continue;
      expect(tenantRootOf(model), `${model} не приводит к корню`).not.toBeNull();
    }
  });

  it("у общих справочников арендатора нет", () => {
    // Кузов W463 и OEM-номер одинаковы для всех сервисов; колонка арендатора
    // там означала бы, что каждый сервис заводит свой Мерседес заново.
    expect(tenantRootOf("VehicleGeneration")).toBeNull();
    expect(tenantRootOf("PartReference")).toBeNull();
    expect(modelsNeedingTenantColumn()).not.toContain("PartReference");
  });

  it("товар принадлежит сервису, а номенклатура — нет", () => {
    // Тонкая, но важная граница: номер детали общий, а цена и остаток — нет.
    expect(MODEL_CLASSIFICATION.Part.kind).toBe("TENANT");
    expect(MODEL_CLASSIFICATION.PartReference.kind).toBe("GLOBAL");
  });

  it("проверка ловит модель без класса", () => {
    // Мутант наоборот: убеждаемся, что сторож вообще способен покраснеть.
    const problems = validateClassification([...schemaModels(), "СовсемНоваяТаблица"]);
    expect(problems.map((p) => p.model)).toContain("СовсемНоваяТаблица");
  });

  it("проверка ловит дочернюю модель под общим справочником", () => {
    const problems = validateClassification(schemaModels());
    expect(problems).toEqual([]);
    // Прямая проверка правила: цепочка не может начинаться с GLOBAL.
    expect(tenantRootOf("PartReferenceFitment")).toBeNull();
  });
});
