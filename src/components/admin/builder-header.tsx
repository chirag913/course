"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ArrowLeft } from "lucide-react";
import { togglePublish } from "@/app/admin/courses/actions";
import type { CourseStatus } from "@/types/database";

export function BuilderHeader({
  courseId,
  title,
  slug,
  status,
}: {
  courseId: string;
  title: string;
  slug: string;
  status: CourseStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href="/admin/courses" className="flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-3.5 w-3.5" /> All courses
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-2xl font-bold text-ink-900">{title || "Untitled Course"}</h1>
          <Badge tone={status === "published" ? "success" : "neutral"}>
            {status === "published" ? "Published" : "Draft"}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status === "published" && (
          <a href={`/courses/${slug}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5" /> View sales page
            </Button>
          </a>
        )}
        <Button
          size="sm"
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
      </div>
    </div>
  );
}
