import "server-only";

const SHIPROCKET_API_URL = "https://apiv2.shiprocket.in/v1/external";

export class ShiprocketError extends Error {}

interface ShiprocketLoginResponse {
  token?: string;
  message?: string;
}

export interface ShiprocketShipment {
  orderReference: string;
  status: string;
  shipmentId: string | null;
  awb: string | null;
  raw: Record<string, unknown>;
}

export async function authenticateShiprocket(email: string, password: string): Promise<string> {
  const response = await fetch(`${SHIPROCKET_API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as ShiprocketLoginResponse;
  if (!response.ok || !body.token) {
    throw new ShiprocketError("Unable to connect to Shiprocket. Please check your API user credentials.");
  }
  return body.token;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export async function fetchShiprocketShipments(token: string): Promise<ShiprocketShipment[]> {
  const shipments: ShiprocketShipment[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(`${SHIPROCKET_API_URL}/orders?per_page=250&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as { data?: unknown; message?: string };
    if (!response.ok) throw new ShiprocketError("Shiprocket could not load your shipments. Please try syncing again.");
    const records = Array.isArray(body.data)
      ? body.data
      : body.data && typeof body.data === "object" && Array.isArray((body.data as { data?: unknown[] }).data)
        ? (body.data as { data: unknown[] }).data
        : [];
    shipments.push(...records.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const raw = value as Record<string, unknown>;
    const orderReference = firstString(raw, ["channel_order_id", "order_id", "order_number"]);
    const status = firstString(raw, ["status", "shipment_status", "current_status"]);
    if (!orderReference || !status) return [];
    return [{
      orderReference,
      status,
      shipmentId: firstString(raw, ["shipment_id", "id"]),
      awb: firstString(raw, ["awb_code", "awb"]),
      raw,
    }];
    }));
    if (records.length < 250) break;
  }
  return shipments;
}
