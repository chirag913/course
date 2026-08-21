import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Materials live in a private Supabase Storage bucket. Access is decided in
// two layers:
//  1. RLS on lesson_resources (resources_select_accessible) — the user's own
//     session must be able to SELECT the row at all (admin, enrolled, or a
//     free-preview lesson on a published course).
//  2. Only once that passes do we mint a short-lived signed URL with the
//     service-role client and redirect to it. The bucket itself has no
//     public or per-user read policy, so a guessed/leaked storage path is
//     useless without going through this route.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const { resourceId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: resource } = await supabase
    .from("lesson_resources")
    .select("id, name, file_path")
    .eq("id", resourceId)
    .single();

  if (!resource) {
    return NextResponse.json({ error: "File not found or you don't have access." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("course-materials")
    .createSignedUrl(resource.file_path, 60, { download: resource.name });

  if (error || !signed) {
    return NextResponse.json({ error: "Could not generate download link." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
