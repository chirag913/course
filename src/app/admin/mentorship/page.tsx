import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { BookOpen, Plus, Users } from "lucide-react";
import { createMentorshipProgram } from "./actions";
import type { Program } from "@/types/database";

export default async function AdminMentorshipProgramsPage() {
  const supabase = await createClient();

  const [{ data: programs }, { data: enrollments }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, title, slug, status, price, currency")
      .eq("type_id", "mentorship")
      .order("title"),
    supabase.from("enrollments").select("program_id").not("program_id", "is", null),
  ]);

  const studentCounts = new Map<string, number>();
  for (const row of enrollments ?? []) {
    studentCounts.set(row.program_id, (studentCounts.get(row.program_id) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Mentorship Programs</h1>
        <form action={createMentorshipProgram}>
          <Button type="submit">
            <Plus className="h-4 w-4" /> New Mentorship Program
          </Button>
        </form>
      </div>

      <div className="mt-6">
        {programs && programs.length > 0 ? (
          <div className="border-t border-ink-300">
            <div className="divide-y divide-ink-300">
              {(programs as Program[]).map((program) => {
                const students = studentCounts.get(program.id) ?? 0;

                return (
                  <Link
                    key={program.id}
                    href={`/admin/mentorship/${program.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-4 transition-colors hover:bg-ink-100/60"
                  >
                    <div>
                      <h3 className="font-display text-lg font-semibold text-ink-900">{program.title}</h3>
                      <p className="mt-1 text-sm text-ink-500">
                        /{program.slug} · {formatPrice(program.price, program.currency)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-ink-700">
                        <Users className="mr-1 inline h-3.5 w-3.5" />
                        {students} student{students !== 1 ? "s" : ""}
                      </p>
                      <p className="mt-1 font-mono text-xs text-ink-500">Status: {program.status}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No mentorship programs yet"
            description="Create your first mentorship program to get started."
            action={
              <form action={createMentorshipProgram}>
                <Button type="submit">
                  <Plus className="h-4 w-4" /> New Mentorship Program
                </Button>
              </form>
            }
          />
        )}
      </div>
    </div>
  );
}

