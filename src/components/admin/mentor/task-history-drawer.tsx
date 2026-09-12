"use client";

import { Drawer } from "./drawer";
import { GenerateTasksButton } from "@/components/admin/generate-tasks-button";
import { MentorTaskRow } from "@/components/admin/mentor-task-row";
import { MentorTaskForm } from "@/components/admin/mentor-task-form";
import type { MentorshipTask } from "@/types/database";

export function TaskHistoryDrawer({
  programId,
  enrollmentId,
  openTasks,
  completedOrSkippedTasks,
  catalogProducts,
  onClose,
}: {
  programId: string;
  enrollmentId: string;
  openTasks: MentorshipTask[];
  completedOrSkippedTasks: MentorshipTask[];
  catalogProducts: { id: string; name: string }[];
  onClose: () => void;
}) {
  const productNameById = new Map(catalogProducts.map((p) => [p.id, p.name]));

  return (
    <Drawer title="Weekly Tasks" onClose={onClose}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          Decision-engine-generated, data-quality, and mentor-created tasks. Skipping/completing here never edits the
          underlying decision record.
        </p>
        <GenerateTasksButton programId={programId} enrollmentId={enrollmentId} />
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <p className="mb-2 font-mono text-xs uppercase text-ink-500">Open ({openTasks.length})</p>
          {openTasks.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing open.</p>
          ) : (
            <div className="space-y-2">
              {openTasks.map((task) => (
                <MentorTaskRow
                  key={task.id}
                  programId={programId}
                  enrollmentId={enrollmentId}
                  task={task}
                  productName={task.product_catalog_id ? (productNameById.get(task.product_catalog_id) ?? null) : null}
                  products={catalogProducts}
                />
              ))}
            </div>
          )}
        </div>

        {completedOrSkippedTasks.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-xs uppercase text-ink-500">Completed / skipped ({completedOrSkippedTasks.length})</p>
            <div className="space-y-2">
              {completedOrSkippedTasks.slice(0, 20).map((task) => (
                <MentorTaskRow
                  key={task.id}
                  programId={programId}
                  enrollmentId={enrollmentId}
                  task={task}
                  productName={task.product_catalog_id ? (productNameById.get(task.product_catalog_id) ?? null) : null}
                  products={catalogProducts}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-ink-300 pt-4">
        <p className="mb-2 font-mono text-xs uppercase text-ink-500">Add a mentor task</p>
        <MentorTaskForm programId={programId} enrollmentId={enrollmentId} products={catalogProducts} />
      </div>
    </Drawer>
  );
}
