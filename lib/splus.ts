const SPLUS_API_URL = process.env.SPLUS_API_URL;
const SPLUS_API_KEY = process.env.SPLUS_API_KEY;
const SPLUS_ENABLED = !!(SPLUS_API_URL && SPLUS_API_KEY);

interface SplusAppointment {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleVin?: string;
  services: string[];
  dateTime: string;
  notes?: string;
}

interface SplusResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

export async function pushAppointment(data: SplusAppointment): Promise<SplusResult> {
  if (!SPLUS_ENABLED) {
    console.log("[SPLUS] Push appointment (mock):", JSON.stringify(data, null, 2));
    return { success: true, externalId: `mock-${Date.now()}` };
  }

  try {
    const res = await fetch(`${SPLUS_API_URL}/api/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SPLUS_API_KEY}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[SPLUS] Push failed:", err);
      return { success: false, error: err };
    }

    const result = await res.json();
    return { success: true, externalId: result.id };
  } catch (err) {
    console.error("[SPLUS] Push error:", err);
    return { success: false, error: "Network error" };
  }
}
