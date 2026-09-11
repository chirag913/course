"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { ImageUploader } from "@/components/admin/image-uploader";
import {
  updateMentorshipProgram,
  updateMentorshipThumbnail,
  toggleMentorshipPublish,
} from "@/app/admin/mentorship/actions";
import type { Program } from "@/types/database";

export function MentorshipProgramForm({ program }: { program: Program }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const boundAction = updateMentorshipProgram.bind(null, program.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <form
        action={(formData) =>
          startTransition(async () => {
            setError(null);
            setSaved(false);
            try {
              await boundAction(formData);
              setSaved(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save.");
            }
          })
        }
        className="space-y-5"
      >
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={program.title} required />
        </div>
        <div>
          <Label htmlFor="slug">URL slug</Label>
          <Input id="slug" name="slug" defaultValue={program.slug} required />
          <p className="mt-1 font-mono text-xs text-ink-500">
            Public URL: {process.env.NEXT_PUBLIC_SITE_URL ?? ""}/mentorship/{program.slug}
          </p>
        </div>
        <div>
          <Label htmlFor="subtitle">Subtitle</Label>
          <Input id="subtitle" name="subtitle" defaultValue={program.subtitle ?? ""} />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <RichTextEditor
            name="description"
            defaultValue={program.description}
            placeholder="What does this mentorship program cover?"
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="price">Price (₹)</Label>
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              step="1"
              defaultValue={program.price / 100}
              required
            />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" name="currency" defaultValue={program.currency} maxLength={3} required />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && !error && <p className="text-sm text-success">Saved.</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" loading={isPending}>
            Save program information
          </Button>
          <Button
            type="button"
            variant="outline"
            loading={isPending}
            onClick={() =>
              startTransition(async () => {
                await toggleMentorshipPublish(program.id, program.status !== "published");
                router.refresh();
              })
            }
          >
            {program.status === "published" ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </form>

      <div>
        <Label>Program thumbnail</Label>
        <ImageUploader
          value={program.thumbnail_url}
          pathPrefix={`mentorship/${program.id}`}
          onUploaded={(url) => startTransition(() => updateMentorshipThumbnail(program.id, url))}
        />
      </div>
    </div>
  );
}
