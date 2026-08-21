"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Trash2, Star } from "lucide-react";
import { addTestimonial, deleteTestimonial, addFaq, deleteFaq } from "@/app/admin/courses/[courseId]/actions";
import type { Testimonial, Faq } from "@/types/database";

export function TestimonialsFaqsEditor({
  courseId,
  testimonials,
  faqs,
}: {
  courseId: string;
  testimonials: Testimonial[];
  faqs: Faq[];
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <TestimonialsPanel courseId={courseId} testimonials={testimonials} />
      <FaqsPanel courseId={courseId} faqs={faqs} />
    </div>
  );
}

function TestimonialsPanel({ courseId, testimonials }: { courseId: string; testimonials: Testimonial[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [rating, setRating] = useState(5);

  function handleAdd() {
    if (!name.trim() || !content.trim()) return;
    startTransition(async () => {
      await addTestimonial(courseId, { student_name: name, content, rating });
      setName("");
      setContent("");
      setRating(5);
      router.refresh();
    });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-900">Testimonials</h3>
      <div className="mt-3 space-y-2">
        {testimonials.map((t) => (
          <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink-100 p-3">
            <div>
              <div className="flex items-center gap-1">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="mt-1 text-sm text-ink-700">&ldquo;{t.content}&rdquo;</p>
              <p className="mt-1 text-xs font-medium text-ink-500">{t.student_name}</p>
            </div>
            <button
              onClick={() => startTransition(async () => {
                await deleteTestimonial(courseId, t.id);
                router.refresh();
              })}
              className="shrink-0 rounded p-1 text-ink-300 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 rounded-lg border border-dashed border-ink-200 p-3">
        <Input placeholder="Student name" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea placeholder="What did they say?" rows={2} value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="flex items-center gap-2">
          <Label className="mb-0 text-xs">Rating</Label>
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="h-8 rounded-lg border border-ink-200 px-2 text-sm"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} star{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <Button size="sm" className="ml-auto" onClick={handleAdd} loading={isPending}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function FaqsPanel({ courseId, faqs }: { courseId: string; faqs: Faq[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  function handleAdd() {
    if (!question.trim() || !answer.trim()) return;
    startTransition(async () => {
      await addFaq(courseId, { question, answer });
      setQuestion("");
      setAnswer("");
      router.refresh();
    });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-900">FAQs</h3>
      <div className="mt-3 space-y-2">
        {faqs.map((faq) => (
          <div key={faq.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink-100 p-3">
            <div>
              <p className="text-sm font-medium text-ink-900">{faq.question}</p>
              <p className="mt-1 text-sm text-ink-600">{faq.answer}</p>
            </div>
            <button
              onClick={() => startTransition(async () => {
                await deleteFaq(courseId, faq.id);
                router.refresh();
              })}
              className="shrink-0 rounded p-1 text-ink-300 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 rounded-lg border border-dashed border-ink-200 p-3">
        <Input placeholder="Question" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <Textarea placeholder="Answer" rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        <Button size="sm" onClick={handleAdd} loading={isPending}>
          Add
        </Button>
      </div>
    </div>
  );
}
