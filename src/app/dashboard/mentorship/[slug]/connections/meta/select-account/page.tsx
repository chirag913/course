import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import { listAdAccountsForPendingConnection } from "../../actions";
import { SelectMetaAccountForm } from "@/components/connections/select-meta-account-form";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ connectionId?: string }>;
}

export default async function SelectMetaAccountPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { connectionId } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  if (!connectionId) notFound();

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("slug", slug)
    .eq("type_id", "mentorship")
    .maybeSingle();
  if (!program) notFound();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("program_id", program.id)
    .maybeSingle();
  if (!enrollment) notFound();

  const adAccounts = await listAdAccountsForPendingConnection(enrollment.id, connectionId);

  return (
    <div>
      <Link
        href={`/dashboard/mentorship/${slug}/connections`}
        className="mb-6 inline-flex items-center text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="mr-1 h-3.5 w-3.5" />
        Back to connections
      </Link>

      <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Select your ad account</h1>
      <p className="mt-1 text-sm text-ink-500">
        Meta authorized this app for your account, which has access to more than one ad account. Choose the one you
        want connected to this mentorship.
      </p>

      <div className="mt-8">
        {adAccounts.length === 0 ? (
          <p className="text-sm text-danger">
            No ad accounts could be loaded. The authorization may have expired — go back and try connecting again.
          </p>
        ) : (
          <SelectMetaAccountForm enrollmentId={enrollment.id} connectionId={connectionId} adAccounts={adAccounts} />
        )}
      </div>
    </div>
  );
}
