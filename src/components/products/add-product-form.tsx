"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProduct } from "@/app/dashboard/mentorship/[slug]/products/actions";

export function AddProductForm({ enrollmentId }: { enrollmentId: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createProduct(enrollmentId, name);
        setName("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add the product.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Product name"
        className="max-w-xs"
        required
      />
      <Button type="submit" loading={isPending}>
        Add product
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
