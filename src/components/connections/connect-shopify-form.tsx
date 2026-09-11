"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { initiateShopifyConnect } from "@/app/dashboard/mentorship/[slug]/connections/actions";

export function ConnectShopifyForm({ enrollmentId }: { enrollmentId: string }) {
  const [shopDomain, setShopDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await initiateShopifyConnect(enrollmentId, shopDomain);
      } catch (e) {
        // A successful call never returns (it redirects); we only reach
        // here on a genuine failure — including Next.js's own redirect
        // signal is never thrown as a normal Error, so this is safe.
        setError(e instanceof Error ? e.message : "Could not start the connection.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="shop-domain">Shopify store domain</Label>
      <div className="flex gap-2">
        <Input
          id="shop-domain"
          placeholder="your-store.myshopify.com"
          value={shopDomain}
          onChange={(e) => setShopDomain(e.target.value)}
        />
        <Button onClick={handleSubmit} loading={isPending} disabled={!shopDomain.trim()}>
          Connect Shopify
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
