"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { ImageUploader } from "@/components/admin/image-uploader";
import { updateCourseInfo, updateThumbnail } from "@/app/admin/courses/[courseId]/actions";
import type { Course } from "@/types/database";

export function CourseInfoForm({ course }: { course: Course }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const boundAction = updateCourseInfo.bind(null, course.id);

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
          <Input id="title" name="title" defaultValue={course.title} required />
        </div>
        <div>
          <Label htmlFor="subtitle">Subtitle</Label>
          <Input id="subtitle" name="subtitle" defaultValue={course.subtitle ?? ""} />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <RichTextEditor name="description" defaultValue={course.description} placeholder="What is this course about?" />
        </div>
        <div>
          <Label htmlFor="what_you_will_learn">What you&apos;ll learn (one per line)</Label>
          <Textarea
            id="what_you_will_learn"
            name="what_you_will_learn"
            rows={4}
            defaultValue={course.what_you_will_learn.join("\n")}
            placeholder={"Build a store from scratch\nFind winning products\nRun profitable ads"}
          />
        </div>
        <div>
          <Label htmlFor="price">Price (₹)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step="1"
            defaultValue={course.price / 100}
            required
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="instructor_name">Instructor name</Label>
            <Input id="instructor_name" name="instructor_name" defaultValue={course.instructor_name ?? ""} />
          </div>
        </div>
        <div>
          <Label htmlFor="instructor_bio">Instructor bio</Label>
          <Textarea id="instructor_bio" name="instructor_bio" rows={3} defaultValue={course.instructor_bio ?? ""} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-emerald-600">Saved.</p>}
        <Button type="submit" loading={isPending}>
          Save course information
        </Button>
      </form>

      <div>
        <Label>Course thumbnail</Label>
        <ImageUploader
          value={course.thumbnail_url}
          pathPrefix={`courses/${course.id}`}
          onUploaded={(url) => startTransition(() => updateThumbnail(course.id, url))}
        />
      </div>
    </div>
  );
}
