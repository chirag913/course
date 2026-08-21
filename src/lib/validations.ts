import { z } from "zod";

export const courseInfoSchema = z.object({
  title: z.string().min(3, "Title is too short").max(200),
  subtitle: z.string().max(300).optional().nullable(),
  description: z.string().max(20000).optional().nullable(),
  price: z.coerce.number().int().min(0, "Price cannot be negative"),
  instructor_name: z.string().max(200).optional().nullable(),
  instructor_bio: z.string().max(2000).optional().nullable(),
});

export const sectionSchema = z.object({
  title: z.string().min(1, "Section title is required").max(200),
});

export const lessonSchema = z
  .object({
    title: z.string().min(1, "Lesson title is required").max(200),
    lesson_type: z.enum(["video", "text", "resource", "mixed"]),
    description: z.string().max(20000).optional().nullable(),
    content: z.string().max(50000).optional().nullable(),
    video_url: z.string().optional().nullable(),
    duration_seconds: z.coerce.number().int().min(0).default(0),
    is_free_preview: z.boolean().default(false),
    is_published: z.boolean().default(true),
  })
  .refine(
    (data) =>
      data.lesson_type !== "video" && data.lesson_type !== "mixed"
        ? true
        : !!data.video_url,
    { message: "A video URL is required for this lesson type", path: ["video_url"] }
  );

export const couponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(40)
    .transform((s) => s.toUpperCase().trim()),
  discount_type: z.enum(["percentage", "fixed"]),
  discount_value: z.coerce.number().int().positive(),
  max_uses: z.coerce.number().int().positive().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export const testimonialSchema = z.object({
  student_name: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  rating: z.coerce.number().int().min(1).max(5),
});

export const faqSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(5000),
});

export const signUpSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
