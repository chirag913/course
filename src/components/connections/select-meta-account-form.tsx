"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { finalizeMetaAccountSelection } from "@/app/dashboard/mentorship/[slug]/connections/actions";
import type { MetaAdAccount } from "@/lib/connections/meta";

export function SelectMetaAccountForm({
  enrollmentId,
  connectionId,
  adAccounts,
}: {
  enrollmentId: string;
  connectionId: string;
  adAccounts: MetaAdAccount[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(adAccounts[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    const account = adAccounts.find((a) => a.id === selectedId);
    if (!account) return;
    setError(null);
    startTransition(async () => {
      try {
        await finalizeMetaAccountSelection(enrollmentId, connectionId, account.id, account.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not finalize the connection.");
      }
    });
  }

  return (
    <div className="max-w-lg space-y-3">
      <div className="divide-y divide-ink-300 border border-ink-300">
        {adAccounts.map((account) => (
          <label
            key={account.id}
            className="flex cursor-pointer items-center gap-3 p-4 hover:bg-ink-100/60"
          >
            <input
              type="radio"
              name="ad_account"
              checked={selectedId === account.id}
              onChange={() => setSelectedId(account.id)}
            />
            <div>
              <p className="font-medium text-ink-900">{account.name}</p>
              <p className="font-mono text-xs text-ink-500">
                {account.id} · {account.currency}
              </p>
            </div>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={handleConfirm} loading={isPending} disabled={!selectedId}>
        Connect this ad account
      </Button>
    </div>
  );
}
