"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { createMentorTask, updateMentorTask, type MentorTaskInput } from "@/app/admin/mentorship/[programId]/students/[enrollmentId]/actions";
import type { MentorshipTask, MentorshipTaskPriority } from "@/types/database";

export function MentorTaskForm({
  programId,
  enrollmentId,
  products,
  existingTask,
  onDone,
}: {
  programId: string;
  enrollmentId: string;
  products: { id: string; name: string }[];
  existingTask?: MentorshipTask;
  onDone?: () => void;
}) {
  const [title, setTitle] = useState(existingTask?.title ?? "");
  const [description, setDescription] = useState(existingTask?.description ?? "");
  const [why, setWhy] = useState(existingTask?.why ?? "");
  const [nextAction, setNextAction] = useState(existingTask?.next_action ?? "");
  const [priority, setPriority] = useState<MentorshipTaskPriority>(existingTask?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(existingTask?.due_date ?? "");
  const [productCatalogId, setProductCatalogId] = useState(existingTask?.product_catalog_id ?? "");
  const [mentorNotes, setMentorNotes] = useState(existingTask?.mentor_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input: MentorTaskInput = {
      title,
      description: description || null,
      why: why || null,
      nextAction: nextAction || null,
      priority,
      dueDate: dueDate || null,
      productCatalogId: productCatalogId || null,
      mentorNotes: mentorNotes || null,
    };
    startTransition(async () => {
      try {
        if (existingTask) {
          await updateMentorTask(programId, enrollmentId, existingTask.id, input);
        } else {
          await createMentorTask(programId, enrollmentId, input);
          setTitle("");
          setDescription("");
          setWhy("");
          setNextAction("");
          setDueDate("");
          setProductCatalogId("");
          setMentorNotes("");
        }
        router.refresh();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save this task.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div>
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Why</Label>
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="Why this matters right now" />
        </div>
        <div>
          <Label>Next action</Label>
          <Textarea value={nextAction} onChange={(e) => setNextAction(e.target.value)} rows={2} placeholder="Exactly what to do" />
        </div>
      </div>
      <div>
        <Label>Description (optional)</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Priority</Label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as MentorshipTaskPriority)}
            className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <Label>Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label>Product (optional)</Label>
          <select
            value={productCatalogId}
            onChange={(e) => setProductCatalogId(e.target.value)}
            className="h-10 w-full rounded-md border border-ink-300 bg-ink-100 px-3 text-sm text-ink-900"
          >
            <option value="">None</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label>Mentor notes (not shown to student)</Label>
        <Textarea value={mentorNotes} onChange={(e) => setMentorNotes(e.target.value)} rows={2} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" loading={isPending}>
          {existingTask ? "Save task" : "Add task"}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
