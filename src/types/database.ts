// Hand-written types mirroring supabase/migrations/0001_init.sql.
// If you regenerate types from a live project (`supabase gen types typescript`),
// this file can be replaced — keep the shape identical.

export type UserRole = "admin" | "student";
export type CourseStatus = "draft" | "published";
export type LessonType = "video" | "text" | "resource" | "mixed";
export type VideoProviderName = "youtube";
export type OrderStatus = "created" | "paid" | "failed" | "refunded";
export type DiscountType = "percentage" | "fixed";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnail_url: string | null;
  price: number; // paise
  currency: string;
  status: CourseStatus;
  what_you_will_learn: string[];
  instructor_name: string | null;
  instructor_bio: string | null;
  instructor_avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface CourseSection {
  id: string;
  course_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  course_section_id: string;
  title: string;
  description: string | null;
  lesson_type: LessonType;
  video_provider: VideoProviderName | null;
  video_id: string | null;
  duration_seconds: number;
  content: string | null;
  position: number;
  is_published: boolean;
  is_free_preview: boolean;
  created_at: string;
  updated_at: string;
}

export interface LessonResource {
  id: string;
  lesson_id: string;
  name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  description: string | null;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  course_id: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  coupon_id: string | null;
  discount_amount: number;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  course_id: string;
  price: number;
  created_at: string;
}

export interface CouponRedemption {
  id: string;
  coupon_id: string;
  order_id: string;
  user_id: string;
  created_at: string;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  order_id: string | null;
  enrolled_at: string;
  created_at: string;
}

export interface LessonProgress {
  id: string;
  user_id: string;
  lesson_id: string;
  course_id: string;
  is_completed: boolean;
  completed_at: string | null;
  last_position_seconds: number;
  last_viewed_at: string;
  created_at: string;
  updated_at: string;
}

export interface Testimonial {
  id: string;
  course_id: string;
  student_name: string;
  student_avatar_url: string | null;
  content: string;
  rating: number;
  position: number;
  is_published: boolean;
  created_at: string;
}

export interface Faq {
  id: string;
  course_id: string;
  question: string;
  answer: string;
  position: number;
  is_published: boolean;
  created_at: string;
}

export interface PublicCurriculumRow {
  id: string;
  course_section_id: string;
  course_id: string;
  title: string;
  lesson_type: LessonType;
  duration_seconds: number;
  position: number;
  is_free_preview: boolean;
}

// Convenience composed shapes used across the UI layer.
export interface LessonWithResources extends Lesson {
  lesson_resources: LessonResource[];
}

export interface SectionWithLessons extends CourseSection {
  lessons: LessonWithResources[];
}

export interface CourseWithCurriculum extends Course {
  course_sections: SectionWithLessons[];
}
