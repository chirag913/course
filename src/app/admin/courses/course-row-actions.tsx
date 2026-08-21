"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { duplicateCourse, deleteCourse, togglePublish } from "./actions";
import { Copy, Trash2, Pencil, ExternalLink } from "lucide-react";
import type { CourseStatus } from "@/types/database";

export function CourseRowActions({
  courseId,
  slug,
  status,
}: {
  courseId: string;
  slug: string;
  status: CourseStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && <p className="w-full text-right text-xs text-red-600">{error}</p>}

      <Link href={`/admin/courses/${courseId}`}>
        <Button size="sm" variant="outline">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </Link>

      {status === "published" && (
        <a href={`/courses/${slug}`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="ghost">
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </Button>
        </a>
      )}

      <Button
        size="sm"
        variant="outline"
        loading={isPending}
        onClick={() =>
          startTransition(async () => {
            await togglePublish(courseId, status !== "published");
            router.refresh();
          })
        }
      >
        {status === "published" ? "Unpublish" : "Publish"}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        loading={isPending}
        onClick={() => startTransition(() => duplicateCourse(courseId))}
      >
        <Copy className="h-3.5 w-3.5" /> Duplicate
      </Button>

      {confirmingDelete ? (
        <>
          <span className="text-xs text-ink-500">Delete this course?</span>
          <Button
            size="sm"
            variant="danger"
            loading={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteCourse(courseId);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not delete.");
                  setConfirmingDelete(false);
                }
              })
            }
          >
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(true)}>
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </Button>
      )}
    </div>
  );
}
