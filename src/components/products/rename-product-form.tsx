"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProductName } from "@/app/dashboard/mentorship/[slug]/products/actions";

export function RenameProductForm({
  enrollmentId,
  productId,
  currentName,
  onDone,
}: {
  enrollmentId: string;
  productId: string;
  currentName: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await updateProductName(enrollmentId, productId, name);
        router.refresh();
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not rename the product.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" required />
      <Button type="submit" size="sm" loading={isPending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Cancel
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
