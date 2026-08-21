import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import type { Course } from "@/types/database";

export function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-subtle transition-shadow hover:shadow-card"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-ink-100">
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt={course.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(min-width: 768px) 33vw, 100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-300">No thumbnail</div>
        )}
      </div>
      <div className="p-5">
        <h3 className="line-clamp-2 text-base font-semibold text-ink-900">{course.title}</h3>
        {course.subtitle && (
          <p className="mt-1 line-clamp-2 text-sm text-ink-500">{course.subtitle}</p>
        )}
        <div className="mt-3 text-base font-semibold text-ink-900">
          {formatPrice(course.price, course.currency)}
        </div>
      </div>
    </Link>
  );
}
