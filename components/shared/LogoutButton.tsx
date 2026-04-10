"use client";

import { logoutAction } from "@/app/actions/logout";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <button type="submit" className={className}>
        Выйти
      </button>
    </form>
  );
}
