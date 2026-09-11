// Hand-written types mirroring supabase/migrations/0001_init.sql.
// If you regenerate types from a live project (`supabase gen types typescript`),
// this file can be replaced — keep the shape identical.

export type UserRole = "admin" | "student";
export type CourseStatus = "draft" | "published";
export type LessonType = "video" | "text" | "resource" | "mixed";
export type VideoProviderName = "youtube";
export type OrderStatus = "created" | "paid" | "failed" | "refunded";
export type DiscountType = "percentage" | "fixed";
export type ProgramType = string;

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

export interface ProgramTypeRecord {
  id: string;
  label: string;
}

export interface Program {
  id: string;
  type_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  thumbnail_url: string | null;
  price: number;
  currency: string;
  status: string;
  what_you_will_learn: string[];
  owner_name: string | null;
  owner_bio: string | null;
  owner_avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface Order {
  id: string;
  user_id: string;
  course_id: string | null;
  program_id: string;
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
  course_id: string | null;
  program_id: string;
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
  course_id: string | null;
  program_id: string;
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

export type MentorshipAccessStatus = "active" | "paused" | "revoked";
// The fourth user-facing state — derived (active + end_date passed), never stored.
export type MentorshipEffectiveStatus = MentorshipAccessStatus | "expired";
export type MentorshipPaymentStatus = "pending" | "paid" | "overdue";

export interface MentorshipProfile {
  id: string;
  enrollment_id: string;
  current_stage: string;
  current_objective: string | null;
  access_status: MentorshipAccessStatus;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  paused_at: string | null;
  whatsapp_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface MentorshipPauseHistory {
  id: string;
  enrollment_id: string;
  paused_at: string;
  resumed_at: string | null;
  paused_by: string | null;
  resumed_by: string | null;
  created_at: string;
}

export interface MentorshipPayment {
  id: string;
  enrollment_id: string;
  amount: number;
  currency: string;
  due_date: string;
  razorpay_link: string | null;
  status: MentorshipPaymentStatus;
  paid_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MentorshipTaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "SKIPPED";
export type MentorshipTaskPriority = "high" | "medium" | "low";
export type MentorshipTaskSource = "DECISION_ENGINE" | "MENTOR" | "DATA_QUALITY" | "FULFILLMENT" | "ACCOUNTABILITY";

export interface MentorshipTask {
  id: string;
  enrollment_id: string;
  week_start: string;
  title: string;
  is_done: boolean;
  position: number;
  status: MentorshipTaskStatus;
  priority: MentorshipTaskPriority;
  source: MentorshipTaskSource;
  product_catalog_id: string | null;
  description: string | null;
  why: string | null;
  next_action: string | null;
  due_date: string | null;
  completed_at: string | null;
  reason_code: string | null;
  dedup_key: string | null;
  mentor_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MentorshipKpi {
  id: string;
  enrollment_id: string;
  metric_key: string;
  metric_label: string;
  value: number;
  recorded_for: string;
  created_at: string;
  updated_at: string;
}

export interface MentorshipProduct {
  id: string;
  enrollment_id: string;
  name: string;
  status: "testing" | "keep" | "kill" | "scale";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MentorshipCall {
  id: string;
  enrollment_id: string;
  scheduled_at: string;
  status: string;
  meeting_link: string | null;
  recording_url: string | null;
  call_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MentorshipNote {
  id: string;
  enrollment_id: string;
  author_id: string | null;
  note: string;
  is_mentor_direction: boolean;
  created_at: string;
}

export interface ProgramResource {
  id: string;
  program_id: string;
  name: string;
  file_path: string;
  file_type: string | null;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export type MentorshipConnectionProvider = "shopify" | "meta";
export type MentorshipConnectionStatus = "connected" | "disconnected" | "pending_selection" | "error";

// Metadata only — never holds tokens. See src/lib/connections/tokens.ts for
// the (deliberately separate, server-only) token row shape.
export interface MentorshipConnection {
  id: string;
  enrollment_id: string;
  provider: MentorshipConnectionProvider;
  status: MentorshipConnectionStatus;
  external_account_id: string | null;
  external_account_name: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Phase B — normalized Shopify/Meta ingestion + sync state.
// Money fields are integers in the currency's minor unit (paise/cents),
// matching courses.price / mentorship_payments.amount. See
// PHASE_B_DATA_INGESTION.md for the full data-model rationale.
// ----------------------------------------------------------------------------

export interface MentorshipShopifyProduct {
  id: string;
  enrollment_id: string;
  external_product_id: string;
  title: string;
  handle: string | null;
  status: string | null;
  vendor: string | null;
  product_type: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export interface MentorshipShopifyProductVariant {
  id: string;
  enrollment_id: string;
  product_id: string | null;
  external_variant_id: string;
  external_product_id: string;
  title: string | null;
  sku: string | null;
  price: number | null;
  compare_at_price: number | null;
  inventory_quantity: number | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export interface MentorshipShopifyOrder {
  id: string;
  enrollment_id: string;
  external_order_id: string;
  order_number: number | null;
  created_at_external: string | null;
  updated_at_external: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  currency: string;
  subtotal_price: number | null;
  total_discounts: number | null;
  total_shipping: number | null;
  total_tax: number | null;
  total_price: number;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export interface MentorshipShopifyOrderLineItem {
  id: string;
  enrollment_id: string;
  order_id: string;
  external_line_item_id: string;
  external_order_id: string;
  product_id: string | null;
  external_product_id: string | null;
  variant_id: string | null;
  external_variant_id: string | null;
  title: string;
  quantity: number;
  price: number;
  total_discount: number;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export interface MentorshipMetaAdAccount {
  id: string;
  enrollment_id: string;
  external_account_id: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export interface MentorshipMetaCampaign {
  id: string;
  enrollment_id: string;
  ad_account_id: string | null;
  external_campaign_id: string;
  external_account_id: string | null;
  name: string | null;
  status: string | null;
  objective: string | null;
  created_time: string | null;
  updated_time: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export interface MentorshipMetaAdSet {
  id: string;
  enrollment_id: string;
  campaign_id: string | null;
  external_ad_set_id: string;
  external_campaign_id: string | null;
  name: string | null;
  status: string | null;
  created_time: string | null;
  updated_time: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export interface MentorshipMetaAd {
  id: string;
  enrollment_id: string;
  ad_set_id: string | null;
  campaign_id: string | null;
  external_ad_id: string;
  external_ad_set_id: string | null;
  external_campaign_id: string | null;
  name: string | null;
  status: string | null;
  created_time: string | null;
  updated_time: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export interface MentorshipMetaAdInsight {
  id: string;
  enrollment_id: string;
  ad_id: string | null;
  external_ad_id: string;
  date: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  link_clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  purchases: number | null;
  purchase_value: number | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export type SyncProvider = "shopify" | "meta";
export type SyncType = "initial" | "incremental" | "manual";
export type SyncRunStatus = "idle" | "running" | "success" | "failed";

// One row per sync ATTEMPT (audit-log style), not one evolving row per
// enrollment/provider. `last_successful_sync_at` is carried forward from the
// previous attempt at start time and overwritten on success — see
// src/lib/sync/state.ts.
export interface MentorshipDataSync {
  id: string;
  enrollment_id: string;
  provider: SyncProvider;
  sync_type: SyncType;
  status: SyncRunStatus;
  started_at: string | null;
  completed_at: string | null;
  last_successful_sync_at: string | null;
  records_processed: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Phase C — canonical product catalog + Shopify/Meta mapping. See
// PHASE_C_PRODUCT_INTELLIGENCE.md. Separate from the legacy
// MentorshipProduct (kill/keep/scale manual tracker), which is untouched.
// ----------------------------------------------------------------------------

export type ProductCatalogStatus = "active" | "archived";
export type ProductCatalogSource = "manual" | "shopify";
export type ProductMatchMethod = "automatic" | "manual";
export type ProductMatchConfidence = "high" | "medium" | "low";

export interface MentorshipProductCatalog {
  id: string;
  enrollment_id: string;
  name: string;
  slug: string;
  status: ProductCatalogStatus;
  source: ProductCatalogSource;
  created_at: string;
  updated_at: string;
}

export interface MentorshipProductShopifyLink {
  id: string;
  enrollment_id: string;
  product_catalog_id: string;
  shopify_product_id: string;
  shopify_variant_id: string | null;
  match_method: ProductMatchMethod;
  confidence: ProductMatchConfidence;
  created_at: string;
  updated_at: string;
}

export interface MentorshipProductMetaLink {
  id: string;
  enrollment_id: string;
  product_catalog_id: string;
  meta_ad_id: string;
  match_method: ProductMatchMethod;
  confidence: ProductMatchConfidence;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Phase D — economics + shipping/RTO. See PHASE_D_ECONOMICS_SHIPPING.md.
// Every cost field is nullable with no default: a missing cost must never
// be silently treated as ₹0 by the calculation layer.
// ----------------------------------------------------------------------------

export type SellingPriceSource = "shopify" | "manual";

export interface MentorshipProductEconomics {
  id: string;
  enrollment_id: string;
  product_catalog_id: string;
  selling_price_minor: number | null;
  selling_price_currency: string;
  selling_price_source: SellingPriceSource | null;
  cogs_minor: number | null;
  shipping_cost_minor: number | null; // per order
  cod_fee_minor: number | null; // per order
  packaging_cost_minor: number | null; // per order
  other_variable_cost_minor: number | null; // per order
  rto_cost_minor: number | null; // per RTO'd order
  created_at: string;
  updated_at: string;
}

export type ShippingImportStatus = "processing" | "completed" | "failed";

export interface MentorshipShippingImport {
  id: string;
  enrollment_id: string;
  filename: string;
  file_hash: string;
  order_column: string;
  status_column: string;
  status: ShippingImportStatus;
  row_count: number;
  matched_count: number;
  unmatched_count: number;
  imported_at: string;
  completed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type CanonicalShippingStatus = "shipped" | "delivered" | "NDR" | "RTO" | "unknown" | "needs_review";
export type ShippingMatchMethod = "exact_order_id" | "exact_order_number" | "unmatched";

export interface MentorshipShippingRow {
  id: string;
  import_id: string;
  enrollment_id: string;
  external_order_reference: string;
  status: CanonicalShippingStatus;
  normalized_order_id: string | null;
  match_method: ShippingMatchMethod;
  raw_data: Record<string, unknown>;
  created_at: string;
}

export type UnmatchedOrderClassification = "cancelled" | "rejected" | "never_shipped" | "other" | "needs_review";

export interface MentorshipUnmatchedOrderClassification {
  id: string;
  enrollment_id: string;
  shopify_order_id: string;
  classification: UnmatchedOrderClassification;
  notes: string | null;
  classified_by: string | null;
  classified_at: string | null;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------------------
// Phase E — deterministic product decision engine. See
// PHASE_E_DECISION_ENGINE.md. Append-only history; no AI, no automated
// actions.
// ----------------------------------------------------------------------------

export type ProductDecisionState = "DATA_NEEDED" | "TEST" | "WATCH" | "ITERATE" | "SCALE" | "RELAUNCH" | "KILL";
export type ProductDecisionPriority = "high" | "medium" | "low";

export interface MentorshipProductDecision {
  id: string;
  enrollment_id: string;
  product_catalog_id: string;
  decision: ProductDecisionState;
  reason_code: string;
  priority: ProductDecisionPriority;
  why: string;
  next_action: string;
  evidence: string[];
  engine_version: string;
  created_at: string;
}

export interface MentorshipProductDecisionOverride {
  id: string;
  enrollment_id: string;
  product_catalog_id: string;
  override_decision: ProductDecisionState;
  override_reason: string;
  created_by: string | null;
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
