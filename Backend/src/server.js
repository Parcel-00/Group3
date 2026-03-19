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
import { saveManifest, logScanEvent, receiveContainer } from "./shipmentDb.js";



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
    const { data: containers, error } = await supabase
      .from("containers")
      .select(
        "id, container_id, manifest_number, title, iso_size_type, ownership, condition, tare_mass_kg, max_gross_mass_kg, created_at, origin_address_id, port_loading_id, port_discharge_id, destination_id"
      )
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Fetch address display text for each container
    const addressIds = new Set();
    (containers ?? []).forEach((c) => {
      [c.origin_address_id, c.port_loading_id, c.port_discharge_id, c.destination_id].forEach(
        (id) => id && addressIds.add(id)
      );
    });
    const { data: addresses } = await supabase
      .from("addresses")
      .select("id, display_text, address_type")
      .in("id", [...addressIds]);

    const addrMap = (addresses ?? []).reduce((acc, a) => {
      acc[a.id] = a;
      return acc;
    }, {});

    const enriched = (containers ?? []).map((c) => ({
      ...c,
      origin: addrMap[c.origin_address_id]?.display_text ?? null,
      port_loading: addrMap[c.port_loading_id]?.display_text ?? null,
      port_discharge: addrMap[c.port_discharge_id]?.display_text ?? null,
      destination: addrMap[c.destination_id]?.display_text ?? null,
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
 * Mark a container as received (writes RECEIVED to container_events)
 * Body: { containerId: string (business id / ISO number), facilityId?, notes? }
 */
app.post("/api/containers/receive", async (req, res) => {
  try {
    const { containerId, facilityId, notes } = req.body ?? {};
    const result = await receiveContainer(containerId, {
      facilityId: facilityId ?? null,
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
    const shipmentDir = path.join(__dirname, "../shipments");
    let files = [];

    try {
      files = await fs.readdir(shipmentDir);
    } catch {
      return res.json({ history: [] });
    }

    const history = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const data = await fs.readFile(path.join(shipmentDir, f), "utf-8");
          const parsed = JSON.parse(data);
          return {
            filename: f,
            timestamp: parsed.timestamp,
            imageProcessed: parsed.imageProcessed,
            success: parsed.processingResult.success,
            confidence: parsed.processingResult.confidenceScore,
          };
        }),
    );

    res.json({
      count: history.length,
      history: history.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
      ),
    });
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
