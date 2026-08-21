"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "info", label: "Course Information" },
  { key: "curriculum", label: "Curriculum" },
  { key: "sales-page", label: "Sales Page Content" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function CourseBuilderTabs({
  infoTab,
  curriculumTab,
  salesPageTab,
}: {
  infoTab: React.ReactNode;
  curriculumTab: React.ReactNode;
  salesPageTab: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("info");

  return (
    <div>
      <div className="flex gap-1 border-b border-ink-100">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active === tab.key
                ? "border-ink-900 text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-800"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="py-6">
        {active === "info" && infoTab}
        {active === "curriculum" && curriculumTab}
        {active === "sales-page" && salesPageTab}
      </div>
    </div>
  );
}
