import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { ProgramCard } from "@/components/programs/program-card";
import {
  getProgramDashboardContext,
  getProgramTypeAdapterOrUnknown,
  getUserEnrolledPrograms,
} from "@/lib/programs";
import type { ProgramRouteContext, ProgramTypeAdapter, UserProgram } from "@/lib/programs/types";

interface ProgramViewModel {
  program: UserProgram;
  adapter: ProgramTypeAdapter;
  routeContext: ProgramRouteContext;
}

const CONNECTION_ERROR_MESSAGES: Record<string, string> = {
  shopify_denied: "Shopify connection was cancelled.",
  shopify_invalid_request: "The Shopify connection link was invalid.",
  shopify_invalid_signature: "The Shopify connection link could not be verified.",
  shopify_invalid_shop: "That doesn't look like a valid Shopify store domain.",
  shopify_expired_state: "That Shopify connection link has expired — please try connecting again.",
  shopify_shop_mismatch: "The Shopify store didn't match the one you started connecting.",
  shopify_not_signed_in: "Please sign in and try connecting Shopify again.",
  shopify_session_mismatch: "Please sign in as the same account that started this connection.",
  shopify_token_exchange_failed: "Shopify could not complete the connection. Please try again.",
  shopify_connection_failed: "Could not save the Shopify connection. Please try again.",
  shopify_token_storage_failed: "Could not securely store the Shopify connection. Please try again.",
  meta_denied: "Meta connection was cancelled.",
  meta_invalid_request: "The Meta connection link was invalid.",
  meta_expired_state: "That Meta connection link has expired — please try connecting again.",
  meta_not_signed_in: "Please sign in and try connecting Meta again.",
  meta_session_mismatch: "Please sign in as the same account that started this connection.",
  meta_token_exchange_failed: "Meta could not complete the connection. Please try again.",
  meta_ad_accounts_fetch_failed: "Could not read your Meta ad accounts. Please try again.",
  meta_no_ad_accounts: "No ad accounts were found on your Meta account. Create an ad account on Meta first, then try connecting again.",
  meta_connection_failed: "Could not save the Meta connection. Please try again.",
  meta_token_storage_failed: "Could not securely store the Meta connection. Please try again.",
};

interface Props {
  searchParams: Promise<{ connectionError?: string }>;
}

export default async function MyProgramsPage({ searchParams }: Props) {
  const { connectionError } = await searchParams;
  const user = await requireUser();

  const enrolledPrograms = await getUserEnrolledPrograms(user.id);
  const programCards = await Promise.all(
    enrolledPrograms.map(async (program) => {
      const adapter = getProgramTypeAdapterOrUnknown(program.programType);
      const routeContext = await getProgramDashboardContext(user.id, program, adapter);

      return {
        program,
        adapter,
        routeContext,
      };
    })
  );

  const [featuredProgram, ...restPrograms] = programCards;

  return (
    <div>
      <p className="eyebrow">Learn</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
        Welcome back{user.profile.full_name ? `, ${user.profile.full_name.split(" ")[0]}` : ""}.
      </h1>

      {connectionError && (
        <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {CONNECTION_ERROR_MESSAGES[connectionError] ?? "Something went wrong connecting that account."}
        </p>
      )}

      {programCards.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={BookOpen}
            title="You haven't purchased any programs yet"
            description="Browse the catalog to find a program to start learning."
            action={
              <Link href="/">
                <Button>Browse courses</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {featuredProgram && (
            <ProgramCard
              program={featuredProgram.program}
              adapter={featuredProgram.adapter}
              routeContext={featuredProgram.routeContext}
              featured
            />
          )}

          {restPrograms.length > 0 && (
            <div className="mt-14">
              <p className="eyebrow">Your Programs</p>
              <div className="mt-4 divide-y divide-ink-300 border-t border-ink-300">
                {restPrograms.map((programView) => (
                  <ProgramCard
                    key={programView.program.programId}
                    program={programView.program}
                    adapter={programView.adapter}
                    routeContext={programView.routeContext}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
