/**
 * Shipment Database Service
 * Saves parsed manifests and scan events to Supabase
 */

import { supabase } from "./supabaseClient.js";

let facilitiesMatchCache = null;
let facilitiesMatchCacheAt = 0;
const FACILITIES_MATCH_TTL_MS = 60_000;

async function getFacilitiesForMatching() {
  const now = Date.now();
  if (
    facilitiesMatchCache &&
    now - facilitiesMatchCacheAt < FACILITIES_MATCH_TTL_MS
  ) {
    return facilitiesMatchCache;
  }
  const { data, error } = await supabase
    .from("facilities")
    .select("id, name, code");
  if (error) {
    console.warn("getFacilitiesForMatching:", error.message);
    return [];
  }
  facilitiesMatchCache = data ?? [];
  facilitiesMatchCacheAt = now;
  return facilitiesMatchCache;
}

function normalizeLocationText(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/[,\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreFacilityMatch(addressNorm, facility) {
  if (!addressNorm || !facility) return 0;
  const name = normalizeLocationText(facility.name || "");
  const code = (facility.code || "").toLowerCase().trim();
  let score = 0;
  if (code && addressNorm.includes(code)) score += 80;
  const words = name.split(" ").filter((w) => w.length > 2);
  for (const w of words) {
    if (addressNorm.includes(w)) score += Math.min(w.length, 12);
  }
  if (name.length > 3 && addressNorm.includes(name)) score += 35;
  return score;
}

/**
 * Pick best facilities row for a manifest location string (e.g. "Hamburg, Germany").
 */
function matchFacilityIdForAddress(addressText, facilities) {
  if (!addressText || !facilities?.length) return null;
  const addressNorm = normalizeLocationText(addressText);
  let bestId = null;
  let bestScore = 0;
  for (const f of facilities) {
    const s = scoreFacilityMatch(addressNorm, f);
    if (s > bestScore) {
      bestScore = s;
      bestId = f.id;
    }
  }
  return bestScore >= 4 ? bestId : null;
}

function pickContainerLocationField(container, keys) {
  for (const k of keys) {
    const v = container[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

/**
 * Map manifest ports to facility IDs: current ≈ port of loading, next ≈ port of discharge (else destination).
 */
async function resolveScheduleFacilitiesFromManifest(container) {
  const facilities = await getFacilitiesForMatching();
  if (!facilities.length) {
    return { current_facility_id: null, next_facility_id: null };
  }

  const loading = pickContainerLocationField(container, [
    "portOfLoading",
    "port_of_loading",
  ]);
  const discharge = pickContainerLocationField(container, [
    "portOfDischarge",
    "port_of_discharge",
  ]);
  const destination = pickContainerLocationField(container, [
    "destination",
  ]);

  const current_facility_id = loading
    ? matchFacilityIdForAddress(loading, facilities)
    : null;
  let next_facility_id = discharge
    ? matchFacilityIdForAddress(discharge, facilities)
    : null;
  if (next_facility_id == null && destination) {
    next_facility_id = matchFacilityIdForAddress(destination, facilities);
  }

  return { current_facility_id, next_facility_id };
}

/**
 * When containers.status is missing in DB, still avoid overwriting manifest current_facility
 * after a RECEIVED/RETURNED event was recorded.
 */
async function hasReceivedOrReturnedEvent(containerDbId) {
  const { data, error } = await supabase
    .from("container_events")
    .select("id")
    .eq("container_id", containerDbId)
    .in("event_type", ["RECEIVED", "RETURNED"])
    .limit(1);
  if (error) {
    console.warn("hasReceivedOrReturnedEvent:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Get or create an address by display text and type
 */
async function upsertAddress(displayText, addressType) {
  if (!displayText || typeof displayText !== "string") return null;

  const { data: existing } = await supabase
    .from("addresses")
    .select("id")
    .eq("display_text", displayText.trim())
    .eq("address_type", addressType)
    .single();

  if (existing) return existing.id;

  const { data: inserted, error } = await supabase
    .from("addresses")
    .insert({
      display_text: displayText.trim(),
      address_type: addressType,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique constraint - fetch existing
      const { data: retry } = await supabase
        .from("addresses")
        .select("id")
        .eq("display_text", displayText.trim())
        .eq("address_type", addressType)
        .single();
      return retry?.id ?? null;
    }
    console.error("Error upserting address:", error);
    return null;
  }
  return inserted?.id ?? null;
}

/**
 * Map manifest container fields to address types
 */
function getContainerAddresses(container) {
  const map = {
    countryOfOrigin: "origin",
    portOfLoading: "port_loading",
    portOfDischarge: "port_discharge",
    destination: "destination",
  };
  const result = {};
  for (const [key, type] of Object.entries(map)) {
    const value = container[key];
    if (value != null && value !== "") {
      result[type] = String(value);
    }
  }
  return result;
}

/**
 * Save or update a container and its contents from parsed manifest data
 * @param {Object} parsedData - { container: {}, items: [], metadata: {} }
 * @param {string} manifestId - optional manifest file id (e.g. "Cont-Mnfst-1")
 * @returns {Promise<{ containerId: string } | null>}
 */
export async function saveManifest(parsedData, manifestId = null) {
  if (!parsedData?.container) return null;

  const container = parsedData.container;
  const containerId = container.containerID || container.containerId;
  if (!containerId) {
    console.warn("Cannot save manifest: missing container ID");
    return null;
  }

  try {
    const addressMap = getContainerAddresses(container);
    const addressIds = {};

    for (const [type, displayText] of Object.entries(addressMap)) {
      addressIds[type] = await upsertAddress(displayText, type);
    }

    const tareMass =
      typeof container.tareMass === "number"
        ? container.tareMass
        : parseFloat(container.tareMass);
    const maxGrossMass =
      typeof container.maxGrossMass === "number"
        ? container.maxGrossMass
        : parseFloat(container.maxGrossMass);

    const containerRow = {
      container_id: containerId,
      manifest_number: container.number ?? null,
      title: container.title ?? null,
      origin_address_id: addressIds.origin ?? null,
      port_loading_id: addressIds.port_loading ?? null,
      port_discharge_id: addressIds.port_discharge ?? null,
      destination_id: addressIds.destination ?? null,
      iso_size_type: container.isoSizeType ?? container.iso_size_type ?? null,
      ownership:
        container.containerOwnership ?? container.container_ownership ?? null,
      condition:
        container.conditionAtFirstReceipt ??
        container.condition_at_first_receipt ??
        null,
      tare_mass_kg: isNaN(tareMass) ? null : tareMass,
      max_gross_mass_kg: isNaN(maxGrossMass) ? null : maxGrossMass,
      updated_at: new Date().toISOString(),
    };

    const schedule = await resolveScheduleFacilitiesFromManifest(container);
    containerRow.next_facility_id = schedule.next_facility_id;

    const { data: existingContainer, error: existingErr } = await supabase
      .from("containers")
      .select("id")
      .eq("container_id", containerId)
      .maybeSingle();

    if (existingErr) {
      console.warn("saveManifest lookup:", existingErr.message);
    }

    let preserveCurrentFacility = false;
    if (existingContainer?.id) {
      preserveCurrentFacility = await hasReceivedOrReturnedEvent(
        existingContainer.id,
      );
    }

    if (!existingContainer || !preserveCurrentFacility) {
      containerRow.current_facility_id = schedule.current_facility_id;
    }

    let dbContainerId;

    if (existingContainer?.id) {
      const { error: updErr } = await supabase
        .from("containers")
        .update(containerRow)
        .eq("id", existingContainer.id);
      if (updErr) {
        console.error("Error updating container:", updErr);
        return null;
      }
      dbContainerId = existingContainer.id;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("containers")
        .insert(containerRow)
        .select("id")
        .single();

      if (insErr?.code === "23505") {
        const { data: raced } = await supabase
          .from("containers")
          .select("id")
          .eq("container_id", containerId)
          .maybeSingle();
        if (raced?.id) {
          const lock = await hasReceivedOrReturnedEvent(raced.id);
          if (!lock) {
            containerRow.current_facility_id = schedule.current_facility_id;
          } else {
            delete containerRow.current_facility_id;
          }
          const { error: raceUpd } = await supabase
            .from("containers")
            .update(containerRow)
            .eq("id", raced.id);
          if (raceUpd) {
            console.error("Error updating container after duplicate:", raceUpd);
            return null;
          }
          dbContainerId = raced.id;
        } else {
          console.error("Error inserting container (duplicate but not found):", insErr);
          return null;
        }
      } else if (insErr) {
        console.error("Error inserting container:", insErr);
        return null;
      } else {
        dbContainerId = inserted.id;
      }
    }

    if (parsedData.items?.length) {
      await supabase
        .from("container_contents")
        .delete()
        .eq("container_id", dbContainerId);

      const contents = parsedData.items.map((item, idx) => {
        const grossMass =
          typeof item.grossMass === "number"
            ? item.grossMass
            : parseFloat(item.grossMass);
        const netMass =
          typeof item.netMass === "number"
            ? item.netMass
            : parseFloat(item.netMass);
        const qty =
          typeof item.quantity === "number"
            ? item.quantity
            : parseInt(item.quantity, 10);

        return {
          container_id: dbContainerId,
          description: item.description ?? null,
          item_code: item.itemCode ?? item.item_code ?? null,
          quantity: isNaN(qty) ? null : qty,
          packaging: item.packaging ?? null,
          net_mass_kg: isNaN(netMass) ? null : netMass,
          gross_mass_kg: isNaN(grossMass) ? null : grossMass,
          sort_order: idx,
        };
      });

      const { error: contentsError } = await supabase
        .from("container_contents")
        .insert(contents);

      if (contentsError) {
        console.error("Error inserting container contents:", contentsError);
      }
    }

    return { containerId: containerId, dbId: dbContainerId };
  } catch (err) {
    console.error("Error saving manifest to DB:", err);
    return null;
  }
}

/**
 * Log a scan event when a container is successfully scanned
 */
export async function logScanEvent(
  containerId,
  { imageFilename, confidenceScore, userId } = {},
) {
  try {
    const { data: container } = await supabase
      .from("containers")
      .select("id")
      .eq("container_id", containerId)
      .single();

    const { error } = await supabase.from("scan_events").insert({
      container_id: container?.id ?? null,
      image_filename: imageFilename ?? null,
      confidence_score: confidenceScore ?? null,
      user_id: userId ?? null,
    });

    if (error) {
      console.error("Error logging scan event:", error);
    }
  } catch (err) {
    console.error("Error in logScanEvent:", err);
  }
}

async function resolveContainerByBusinessId(containerId) {
  const trimmed =
    containerId != null && typeof containerId === "string"
      ? containerId.trim()
      : containerId;

  const { data: container, error } = await supabase
    .from("containers")
    .select("id")
    .eq("container_id", trimmed)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!container?.id) return { error: "Container not found" };
  return { container };
}

async function writeContainerEvent(
  containerDbId,
  eventType,
  { facilityId, notes, userId } = {},
) {
  const eventRow = {
    container_id: containerDbId,
    event_type: eventType,
    facility_id: facilityId ?? null,
    notes: notes != null && notes !== "" ? String(notes) : null,
    user_id: userId ?? null,
  };

  const { data: event, error } = await supabase
    .from("container_events")
    .insert(eventRow)
    .select("id, event_type, created_at, facility_id, notes")
    .single();

  if (error) return { error: error.message };
  return { event };
}

/**
 * Record that a container was physically received (yard / warehouse).
 * Inserts RECEIVED into container_events and updates containers.status when columns exist.
 *
 * @param {string} containerId - Business container id (containers.container_id), e.g. ISO number
 * @param {{ facilityId?: string, notes?: string, userId?: string }} [options]
 * @returns {Promise<{ ok: true, dbId: string, event: object } | { ok: false, error: string }>}
 */
export async function receiveContainer(containerId, options = {}) {
  const { facilityId, notes, userId } = options;

  try {
    if (!containerId || typeof containerId !== "string") {
      return { ok: false, error: "containerId is required" };
    }

    const { container, error: lookupError } =
      await resolveContainerByBusinessId(containerId);
    if (lookupError) {
      return { ok: false, error: lookupError };
    }

    const { event, error: eventError } = await writeContainerEvent(
      container.id,
      "RECEIVED",
      { facilityId, notes, userId },
    );
    if (eventError) {
      console.error("receiveContainer insert:", eventError);
      return { ok: false, error: eventError };
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
      status: "RECEIVED",
      current_facility_id: facilityId ?? null,
    };

    const { error: updateError } = await supabase
      .from("containers")
      .update(updatePayload)
      .eq("id", container.id);

    if (updateError) {
      console.warn(
        "receiveContainer: event saved but container update failed (check migrations):",
        updateError.message,
      );
    }

    return { ok: true, dbId: container.id, event };
  } catch (err) {
    console.error("receiveContainer:", err);
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function reportDamage(
  containerId,
  { notes, userId } = {},
) {
  try {
    const { container, error: lookupError } =
      await resolveContainerByBusinessId(containerId);
    if (lookupError) {
      return { ok: false, error: lookupError };
    }

    const { event, error: eventError } = await writeContainerEvent(
      container.id,
      "DAMAGE_REPORTED",
      { notes, userId },
    );
    if (eventError) {
      console.error("reportDamage insert:", eventError);
      return { ok: false, error: eventError };
    }

    return { ok: true, dbId: container.id, event };
  } catch (err) {
    console.error("reportDamage:", err);
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function forwardContainer(
  containerId,
  { facilityId, notes, userId } = {},
) {
  try {
    const { container, error: lookupError } =
      await resolveContainerByBusinessId(containerId);
    if (lookupError) {
      return { ok: false, error: lookupError };
    }

    const { event, error: eventError } = await writeContainerEvent(
      container.id,
      "FORWARDED",
      { facilityId, notes, userId },
    );
    if (eventError) {
      console.error("forwardContainer insert:", eventError);
      return { ok: false, error: eventError };
    }

    return { ok: true, dbId: container.id, event };
  } catch (err) {
    console.error("forwardContainer:", err);
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}

export async function returnContainer(
  containerId,
  { facilityId, notes, userId } = {},
) {
  try {
    const { container, error: lookupError } =
      await resolveContainerByBusinessId(containerId);
    if (lookupError) {
      return { ok: false, error: lookupError };
    }

    const { event, error: eventError } = await writeContainerEvent(
      container.id,
      "RETURNED",
      { facilityId, notes, userId },
    );
    if (eventError) {
      console.error("returnContainer insert:", eventError);
      return { ok: false, error: eventError };
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
      status: "RETURNED",
      current_facility_id: facilityId ?? null,
    };
    const { error: updateError } = await supabase
      .from("containers")
      .update(updatePayload)
      .eq("id", container.id);
    if (updateError) {
      console.error("returnContainer update:", updateError);
      return { ok: false, error: updateError.message };
    }

    return { ok: true, dbId: container.id, event };
  } catch (err) {
    console.error("returnContainer:", err);
    return { ok: false, error: err?.message ?? "Unknown error" };
  }
}
