/**
 * Shipment Manifest API Server
 * Handles file uploads, image processing, and JSON generation
 */

import "dotenv/config";
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { ShipmentProcessor } from "./shipmentProcessor.js";
import { supabase } from "./supabaseClient.js";
import {
  saveManifest,
  logScanEvent,
  receiveContainer,
  reportDamage,
  forwardContainer,
  returnContainer,
} from "./shipmentDb.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid auth token" });
    }

    req.user = data.user;
    next();
  } catch (err) {
    res.status(500).json({ error: "Auth verification failed" });
  }
};

// File upload configuration
const uploadDir = path.join(__dirname, "../uploads");
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Accept image files
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image and PDF files are allowed"));
    }
  },
});

// Initialize shipment processor
let processor = null;

/**
 * Initialize the processor with manifest files
 */
async function seedManifestsToDb() {
  if (!processor?.manifestCache) return;
  let saved = 0;
  for (const [manifestId, data] of processor.manifestCache) {
    const result = await saveManifest(data.parsedData, manifestId);
    if (result) saved++;
  }
  if (saved > 0) {
    console.log(`Seeded ${saved} manifests to database`);
  }
}

async function initializeProcessor() {
  const manifestDir = path.join(__dirname, "../../ShipmentManifestTextFiles");
  const uniqueIdDir = path.join(__dirname, "../../ShipmentUniqueIdentifiers");

  processor = new ShipmentProcessor(manifestDir, uniqueIdDir);
  try {
    await processor.loadManifests();
    await seedManifestsToDb();
    console.log("Shipment processor initialized");
  } catch (err) {
    console.error("Failed to initialize processor:", err);
    process.exit(1);
  }
}

// Routes

/**
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    processorReady: processor ? true : false,
    timestamp: new Date().toISOString(),
  });
});

// All API routes below this point require auth
app.use("/api", requireAuth);

/**
 * Get list of available manifests
 */
app.get("/api/manifests", (req, res) => {
  if (!processor) {
    return res.status(503).json({ error: "Processor not ready" });
  }

  const manifests = Array.from(processor.manifestCache.entries()).map(
    ([id, data]) => ({
      id,
      filename: data.filename,
      containerNumber: data.parsedData.container.number,
      itemCount: data.parsedData.items.length,
    }),
  );

  res.json({
    count: manifests.length,
    manifests,
  });
});

/**
 * Get containers from database
 */
app.get("/api/containers", async (req, res) => {
  try {
    const filterBusinessId = req.query?.container_id;
    let query = supabase
      .from("containers")
      .select(
        "id, container_id, manifest_number, title, iso_size_type, ownership, condition, tare_mass_kg, max_gross_mass_kg, created_at, origin_address_id, port_loading_id, port_discharge_id, destination_id, current_facility_id, next_facility_id, status",
      )
      .order("created_at", { ascending: false });

    if (filterBusinessId) {
      query = query.eq("container_id", String(filterBusinessId).trim());
    }

    const { data: containers, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Fetch address display text for each container
    const addressIds = new Set();
    const facilityIds = new Set();
    (containers ?? []).forEach((c) => {
      [c.origin_address_id, c.port_loading_id, c.port_discharge_id, c.destination_id].forEach(
        (id) => id && addressIds.add(id),
      );
      if (c.current_facility_id) facilityIds.add(c.current_facility_id);
      if (c.next_facility_id) facilityIds.add(c.next_facility_id);
    });
    const { data: addresses } = await supabase
      .from("addresses")
      .select("id, display_text, address_type")
      .in("id", [...addressIds]);

    const addrMap = (addresses ?? []).reduce((acc, a) => {
      acc[a.id] = a;
      return acc;
    }, {});

    let facilityMap = {};
    if (facilityIds.size > 0) {
      const { data: facRows } = await supabase
        .from("facilities")
        .select("id, name, code")
        .in("id", [...facilityIds]);
      facilityMap = (facRows ?? []).reduce((acc, f) => {
        acc[f.id] = f;
        return acc;
      }, {});
    }

    const enriched = (containers ?? []).map((c) => ({
      ...c,
      origin: addrMap[c.origin_address_id]?.display_text ?? null,
      port_loading: addrMap[c.port_loading_id]?.display_text ?? null,
      port_discharge: addrMap[c.port_discharge_id]?.display_text ?? null,
      destination: addrMap[c.destination_id]?.display_text ?? null,
      current_facility: facilityMap[c.current_facility_id] ?? null,
      next_facility: facilityMap[c.next_facility_id] ?? null,
    }));

    res.json({ count: enriched.length, containers: enriched });
  } catch (err) {
    console.error("Error fetching containers:", err);
    res.status(500).json({ error: "Failed to fetch containers" });
  }
});

/**
 * Get single container with contents from database
 */
app.get("/api/containers/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { data: container, error } = await supabase
      .from("containers")
      .select("*, container_contents(*)")
      .eq("id", id)
      .single();

    if (error || !container) {
      return res.status(404).json({ error: "Container not found" });
    }

    const addrIds = [
      container.origin_address_id,
      container.port_loading_id,
      container.port_discharge_id,
      container.destination_id,
    ].filter(Boolean);
    const { data: addresses } = await supabase
      .from("addresses")
      .select("id, display_text, address_type")
      .in("id", addrIds);

    const addrMap = (addresses ?? []).reduce((acc, a) => {
      acc[a.id] = a.display_text;
      return acc;
    }, {});

    res.json({
      ...container,
      origin: addrMap[container.origin_address_id] ?? null,
      port_loading: addrMap[container.port_loading_id] ?? null,
      port_discharge: addrMap[container.port_discharge_id] ?? null,
      destination: addrMap[container.destination_id] ?? null,
    });
  } catch (err) {
    console.error("Error fetching container:", err);
    res.status(500).json({ error: "Failed to fetch container" });
  }
});

/**
 * Get facilities list for receiver workflows
 */
app.get("/api/facilities", async (req, res) => {
  try {
    let raw;
    let error;
    ({ data: raw, error } = await supabase
      .from("facilities")
      .select("*")
      .order("name", { ascending: true }));
    if (error) {
      ({ data: raw, error } = await supabase
        .from("facilities")
        .select("*")
        .order("id", { ascending: true }));
    }

    if (error) {
      console.error("GET /api/facilities:", error.message);
      return res.status(500).json({ error: error.message });
    }

    const rows = raw ?? [];
    const facilities = rows.map((r) => ({
      id: r.id,
      name: r.name ?? r.title ?? r.facility_name ?? "Facility",
      code: r.code ?? r.facility_code ?? null,
    }));

    if (facilities.length === 0) {
      console.warn(
        "GET /api/facilities: 0 rows (check RLS policies, table name public.facilities, or SUPABASE_SERVICE_ROLE_KEY on backend).",
      );
    }

    res.json({ count: facilities.length, facilities });
  } catch (err) {
    console.error("Error fetching facilities:", err);
    res.status(500).json({ error: "Failed to fetch facilities" });
  }
});

/**
 * Get containers currently at a facility or scheduled to arrive there (next_facility_id).
 */
app.get("/api/facilities/:id/containers", async (req, res) => {
  try {
    const facilityId = req.params.id;

    const { data: atOrScheduled, error: atFacilityError } = await supabase
      .from("containers")
      .select("id")
      .or(
        `current_facility_id.eq.${facilityId},next_facility_id.eq.${facilityId}`,
      );

    if (atFacilityError) {
      return res.status(500).json({ error: atFacilityError.message });
    }

    // Rely on containers.current_facility_id / next_facility_id only. Event-based "scheduled"
    // logic incorrectly kept units on a facility's list after forward because FORWARDED rows
    // store the origin facility_id, not the destination.
    const columnMatchIds = (atOrScheduled ?? []).map((row) => row.id);
    const containerIds = [...new Set(columnMatchIds)];
    if (containerIds.length === 0) {
      return res.json({ count: 0, containers: [] });
    }

    const { data: containers, error: containersError } = await supabase
      .from("containers")
      .select("id, container_id, status, current_facility_id, next_facility_id")
      .in("id", containerIds)
      .order("container_id", { ascending: true });

    if (containersError) {
      return res.status(500).json({ error: containersError.message });
    }

    const rows = containers ?? [];
    const incomingDbIds = rows
      .filter(
        (c) =>
          String(c.next_facility_id ?? "") === String(facilityId) &&
          String(c.current_facility_id ?? "") !== String(facilityId),
      )
      .map((c) => c.id);

    let incomingFromByContainerId = {};
    if (incomingDbIds.length > 0) {
      const { data: moveRows, error: moveErr } = await supabase
        .from("container_events")
        .select("container_id, facility_id, created_at")
        .in("container_id", incomingDbIds)
        .in("event_type", ["FORWARDED", "RETURNED"])
        .order("created_at", { ascending: false });
      if (!moveErr && moveRows?.length) {
        incomingFromByContainerId = moveRows.reduce((acc, ev) => {
          if (ev.container_id && !acc[ev.container_id]) {
            acc[ev.container_id] = ev.facility_id ?? null;
          }
          return acc;
        }, {});
      }
    }

    const enriched = rows.map((c) => ({
      ...c,
      incoming_from_facility_id:
        String(c.next_facility_id ?? "") === String(facilityId) &&
        String(c.current_facility_id ?? "") !== String(facilityId)
          ? incomingFromByContainerId[c.id] ?? null
          : null,
    }));

    res.json({ count: enriched.length, containers: enriched });
  } catch (err) {
    console.error("Error fetching facility containers:", err);
    res.status(500).json({ error: "Failed to fetch facility containers" });
  }
});

/**
 * List addresses (manifest-linked locations) for receiver / forward destination pickers.
 */
app.get("/api/addresses", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("addresses")
      .select("id, display_text, address_type")
      .order("display_text", { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const addresses = (data ?? []).map((a) => ({
      id: a.id,
      display_text: a.display_text ?? "",
      address_type: a.address_type ?? null,
    }));

    res.json({ count: addresses.length, addresses });
  } catch (err) {
    console.error("Error fetching addresses:", err);
    res.status(500).json({ error: "Failed to fetch addresses" });
  }
});

/**
 * Containers whose manifest references this address (origin, loading, discharge, or destination).
 */
app.get("/api/addresses/:id/containers", async (req, res) => {
  try {
    const addressId = req.params.id;
    const idStr = String(addressId);
    const idOk =
      /^\d+$/.test(idStr) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idStr,
      );
    if (!idOk) {
      return res.status(400).json({ error: "Invalid address id" });
    }

    const { data: containers, error } = await supabase
      .from("containers")
      .select(
        "id, container_id, status, current_facility_id, next_facility_id, origin_address_id, port_loading_id, port_discharge_id, destination_id",
      )
      .or(
        `origin_address_id.eq.${addressId},port_loading_id.eq.${addressId},port_discharge_id.eq.${addressId},destination_id.eq.${addressId}`,
      )
      .order("container_id", { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ count: containers?.length ?? 0, containers: containers ?? [] });
  } catch (err) {
    console.error("Error fetching address containers:", err);
    res.status(500).json({ error: "Failed to fetch address containers" });
  }
});

/**
 * Get event history for a container (container DB uuid)
 */
app.get("/api/containers/:id/events", async (req, res) => {
  try {
    const containerDbId = req.params.id;
    const { data, error } = await supabase
      .from("container_events")
      .select("id, event_type, facility_id, notes, created_at")
      .eq("container_id", containerDbId)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ count: data?.length ?? 0, events: data ?? [] });
  } catch (err) {
    console.error("Error fetching container events:", err);
    res.status(500).json({ error: "Failed to fetch container events" });
  }
});

/**
 * Mark a container as received (writes RECEIVED to container_events)
 * Body: { containerId: string (business id / ISO number), facilityId?, notes? }
 */
app.post("/api/containers/receive", async (req, res) => {
  try {
    const { containerId, facilityId, addressId, notes } = req.body ?? {};
    const result = await receiveContainer(containerId, {
      facilityId: facilityId ?? null,
      addressId: addressId ?? null,
      notes: notes ?? null,
      userId: req.user?.id ?? null,
    });

    if (!result.ok) {
      const status =
        result.error === "Container not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      containerDbId: result.dbId,
      event: result.event,
    });
  } catch (err) {
    console.error("Error receiving container:", err);
    res.status(500).json({ error: "Failed to record receive" });
  }
});

app.post("/api/containers/forward", async (req, res) => {
  try {
    const { containerId, facilityId, toAddressId, toFacilityId, notes } =
      req.body ?? {};
    const result = await forwardContainer(containerId, {
      facilityId: facilityId ?? null,
      toAddressId: toAddressId ?? null,
      toFacilityId: toFacilityId ?? null,
      notes: notes ?? null,
      userId: req.user?.id ?? null,
    });

    if (!result.ok) {
      const status = result.error === "Container not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      containerDbId: result.dbId,
      event: result.event,
    });
  } catch (err) {
    console.error("Error forwarding container:", err);
    res.status(500).json({ error: "Failed to forward container" });
  }
});

app.post("/api/containers/return", async (req, res) => {
  try {
    const { containerId, facilityId, addressId, notes, toFacilityId } =
      req.body ?? {};
    const result = await returnContainer(containerId, {
      facilityId: facilityId ?? null,
      addressId: addressId ?? null,
      toFacilityId: toFacilityId ?? null,
      notes: notes ?? null,
      userId: req.user?.id ?? null,
    });

    if (!result.ok) {
      const status = result.error === "Container not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      containerDbId: result.dbId,
      event: result.event,
    });
  } catch (err) {
    console.error("Error returning container:", err);
    res.status(500).json({ error: "Failed to return container" });
  }
});

app.post("/api/containers/damage", async (req, res) => {
  try {
    const { containerId, notes } = req.body ?? {};
    const result = await reportDamage(containerId, {
      notes: notes ?? null,
      userId: req.user?.id ?? null,
    });

    if (!result.ok) {
      const status = result.error === "Container not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      containerDbId: result.dbId,
      event: result.event,
    });
  } catch (err) {
    console.error("Error reporting damage:", err);
    res.status(500).json({ error: "Failed to report damage" });
  }
});

/**
 * Get specific manifest by ID
 */
app.get("/api/manifests/:id", (req, res) => {
  if (!processor) {
    return res.status(503).json({ error: "Processor not ready" });
  }

  const manifest = processor.manifestCache.get(req.params.id);
  if (!manifest) {
    return res.status(404).json({ error: "Manifest not found" });
  }

  res.json(manifest.parsedData);
});

/**
 * Upload shipment image and generate JSON
 * POST /api/shipments/process
 */
app.post("/api/shipments/process", upload.single("image"), async (req, res) => {
  try {
    if (!processor) {
      return res.status(503).json({ error: "Processor not ready" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log(`Processing shipment from image: ${req.file.filename}`);

    // Process the shipment
    const shipmentData = await processor.processShipment(req.file.path);

    // Save to database and log scan
    if (shipmentData.shipmentDetails?.container) {
      const containerId =
        shipmentData.shipmentDetails.container.containerID ||
        shipmentData.shipmentDetails.container.containerId;
      await saveManifest({
        container: shipmentData.shipmentDetails.container,
        items: shipmentData.shipmentDetails.items ?? [],
        metadata: shipmentData.metadata ?? {},
      });
      if (containerId) {
        await logScanEvent(containerId, {
          imageFilename: req.file.filename,
          confidenceScore: shipmentData.processingResult?.confidenceScore ?? null,
          userId: req.user?.id ?? null,
        });
      }
    }

    // Save JSON to file
    const jsonDir = path.join(__dirname, "../shipments");
    await fs.mkdir(jsonDir, { recursive: true });

    const timestamp = Date.now();
    const jsonFilename = `shipment-${timestamp}.json`;
    const jsonPath = path.join(jsonDir, jsonFilename);

    await fs.writeFile(jsonPath, JSON.stringify(shipmentData, null, 2));

    // Return success response
    res.json({
      success: true,
      shipmentData,
      savedFile: jsonFilename,
      fileLocation: `/api/shipments/json/${jsonFilename}`,
    });
  } catch (err) {
    console.error("Error processing shipment:", err);
    res.status(500).json({
      error: "Failed to process shipment",
      message: err.message,
    });
  }
});

/**
 * Upload multiple shipment images
 */
app.post(
  "/api/shipments/bulk",
  upload.array("images", 10),
  async (req, res) => {
    try {
      if (!processor) {
        return res.status(503).json({ error: "Processor not ready" });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const results = [];

      for (const file of req.files) {
        try {
          const shipmentData = await processor.processShipment(file.path);
          results.push({
            filename: file.originalname,
            success: true,
            data: shipmentData,
          });
        } catch (err) {
          results.push({
            filename: file.originalname,
            success: false,
            error: err.message,
          });
        }
      }

      res.json({
        totalFiles: req.files.length,
        successCount: results.filter((r) => r.success).length,
        results,
      });
    } catch (err) {
      console.error("Error processing bulk shipments:", err);
      res.status(500).json({
        error: "Failed to process bulk shipments",
        message: err.message,
      });
    }
  },
);

/**
 * Retrieve generated JSON file
 */
app.get("/api/shipments/json/:filename", async (req, res) => {
  try {
    const jsonPath = path.join(__dirname, "../shipments", req.params.filename);

    // Prevent directory traversal
    if (
      !path
        .resolve(jsonPath)
        .startsWith(path.resolve(__dirname, "../shipments"))
    ) {
      return res.status(403).json({ error: "Invalid file path" });
    }

    const data = await fs.readFile(jsonPath, "utf-8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch (err) {
    res.status(404).json({ error: "File not found" });
  }
});

/**
 * Download JSON file
 */
app.get("/api/shipments/download/:filename", async (req, res) => {
  try {
    const jsonPath = path.join(__dirname, "../shipments", req.params.filename);

    // Prevent directory traversal
    if (
      !path
        .resolve(jsonPath)
        .startsWith(path.resolve(__dirname, "../shipments"))
    ) {
      return res.status(403).json({ error: "Invalid file path" });
    }

    res.download(jsonPath, req.params.filename);
  } catch (err) {
    res.status(404).json({ error: "File not found" });
  }
});

/**
 * Get processing history
 */
app.get("/api/shipments/history", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("scan_events")
      .select(
        "id, image_filename, confidence_score, created_at, user_id, containers(container_id)"
      )
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const history = (data ?? []).map((row) => ({
      id: row.id,
      timestamp: row.created_at,
      imageName: row.image_filename,
      confidence: row.confidence_score,
      containerId: row.containers?.container_id ?? null,
      userId: row.user_id ?? null,
    }));

    res.json({ count: history.length, history });
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// Initialize and start server
async function start() {
  try {
    await initializeProcessor();
    app.listen(PORT, () => {
      console.log(`Shipment API server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
