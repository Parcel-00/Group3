/**
 * Shipment Database Service
 * Saves parsed manifests and scan events to Supabase
 */

import { supabase } from "./supabaseClient.js";

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

    const { data: existingContainer } = await supabase
      .from("containers")
      .select("id")
      .eq("container_id", containerId)
      .single();

    let dbContainerId;

    if (existingContainer) {
      await supabase
        .from("containers")
        .update(containerRow)
        .eq("id", existingContainer.id);
      dbContainerId = existingContainer.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("containers")
        .insert(containerRow)
        .select("id")
        .single();

      if (error) {
        console.error("Error inserting container:", error);
        return null;
      }
      dbContainerId = inserted.id;
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
  { imageFilename, confidenceScore, userId } = {}
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
