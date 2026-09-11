"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RenameProductForm } from "./rename-product-form";

export function ProductNameEditor({
  enrollmentId,
  productId,
  name,
}: {
  enrollmentId: string;
  productId: string;
  name: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <RenameProductForm
        enrollmentId={enrollmentId}
        productId={productId}
        currentName={name}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-display text-2xl font-bold tracking-tight text-ink-900">{name}</span>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </span>
  );
}
