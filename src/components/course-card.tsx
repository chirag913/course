import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import type { Course } from "@/types/database";

export function CourseCard({ course }: { course: Course }) {
  return (
    <Link href={`/courses/${course.slug}`} className="group block">
      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-ink-300 bg-ink-100">
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt={course.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(min-width: 768px) 33vw, 100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-500">No thumbnail</div>
        )}
      </div>
      <div className="mt-4">
        <h3 className="line-clamp-2 font-display text-lg font-semibold text-ink-900">{course.title}</h3>
        {course.subtitle && (
          <p className="mt-1 line-clamp-2 text-sm text-ink-500">{course.subtitle}</p>
        )}
        <div className="mt-2 font-mono text-sm text-brand-300">
          {formatPrice(course.price, course.currency)}
        </div>
      </div>
    </Link>
  );
}
