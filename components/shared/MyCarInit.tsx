"use client";

import { useLayoutEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MY_CAR_KEY } from "@/lib/my-car-store";

/**
 * Restores the saved "my car" filter on the parts page when the URL is bare.
 * Runs only on `/parts`. Mounting it globally is fine — `pathname !== "/parts"`
 * makes it a no-op everywhere else.
 *
 * Guards (in order):
 *  - pathname guard: only `/parts`
 *  - either-not-both: any car param in URL means the page owns the state.
 *    Prevents loops in the partial-param edge case (e.g. only `?model=` set).
 *  - showAll override: when the user clicked "Показать все запчасти",
 *    `?showAll=1` survives. Without this guard, back-button / popstate / reload
 *    silently re-add the saved car and the escape hatch never sticks.
 *  - self-heal: structurally invalid localStorage gets removed instead of
 *    leaving the user stuck in a silent no-op.
 */
export function MyCarInit(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useLayoutEffect(() => {
    if (pathname !== "/parts") return;
    if (searchParams.get("model") || searchParams.get("generation")) return;
    if (searchParams.get("showAll") === "1") return;

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(MY_CAR_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        localStorage.removeItem(MY_CAR_KEY);
      } catch {}
      return;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { model?: unknown }).model !== "string" ||
      typeof (parsed as { generation?: unknown }).generation !== "string"
    ) {
      try {
        localStorage.removeItem(MY_CAR_KEY);
      } catch {}
      return;
    }

    const car = parsed as { model: string; generation: string };
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("model", car.model);
    newParams.set("generation", car.generation);
    router.replace(`/parts?${newParams.toString()}`);
  }, [pathname, searchParams, router]);

  return null;
}
