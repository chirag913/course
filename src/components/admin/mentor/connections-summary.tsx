"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "./drawer";
import { SyncNowButton } from "@/components/connections/sync-now-button";
import { DisconnectButton } from "@/components/connections/disconnect-button";
import type { MentorshipConnection } from "@/types/database";

const PROVIDERS = [
  { key: "shopify", label: "Shopify" },
  { key: "meta", label: "Meta Ads" },
] as const;

export function ConnectionsSummary({
  enrollmentId,
  connectionByProvider,
}: {
  enrollmentId: string;
  connectionByProvider: Map<string, MentorshipConnection>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-ink-300 bg-ink-100 p-5">
      <p className="font-display text-lg font-semibold text-ink-900">Connections</p>
      <div className="mt-2 space-y-1.5">
        {PROVIDERS.map(({ key, label }) => {
          const connection = connectionByProvider.get(key);
          const isConnected = connection?.status === "connected";
          return (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-ink-700">{label}</span>
              <span className={`flex items-center gap-1.5 font-mono text-xs ${isConnected ? "text-success" : "text-ink-500"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-success" : "bg-ink-400"}`} />
                {isConnected ? "Connected" : "Not connected"}
              </span>
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        Manage Connections
      </Button>

      {open && (
        <Drawer title="Connections" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {PROVIDERS.map(({ key, label }) => {
              const connection = connectionByProvider.get(key);
              const isConnected = connection?.status === "connected";
              return (
                <div key={key} className="border border-ink-300 p-3">
                  <p className="font-medium text-ink-900">{label}</p>
                  <p className="mt-1 font-mono text-xs text-ink-500">
                    {isConnected
                      ? `Connected · ${connection?.external_account_name ?? connection?.external_account_id}`
                      : connection?.status === "pending_selection"
                        ? "Pending account selection"
                        : "Not connected"}
                  </p>
                  {isConnected && connection && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <SyncNowButton enrollmentId={enrollmentId} provider={key} />
                      <DisconnectButton enrollmentId={enrollmentId} connectionId={connection.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Drawer>
      )}
    </div>
  );
}
