import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import * as fs from "fs";

dotenv.config();

interface AnalysisResult {
  isElectrical: boolean;
  descriptiveName: string;
  description: string;
  electricalType: string;
  componentsDetected: string[];
  craftsmanshipRating: string;
}

const GEMINI_PROMPT = `You are an expert master electrician and AI Vision Analyst. Your task is to analyze the provided image and determine with high confidence if it depicts electrical work.

Identify the presence of these PRIORITIZED components and scenarios:
1. CIRCUIT BREAKERS & MAIN SERVICE PANELS:
   - Breaker boxes, load centers, busbars, main breakers (Siemens, Square D, Eaton, Cutler-Hammer, GE), branch breakers, subpanels, dual-pole breakers, and arc-fault/ground-fault circuit breakers (AFCI/GFCI breakers).
2. ROUGH-IN WIRING & CABLES:
   - Non-metallic sheathed cables (Romex / NM-B), metal-clad (MC) cables, separate THHN/THWN conductors in panels or gutters, wire gauges (e.g., 14, 12, 10, 8 AWG), wire colors (black, white, bare copper, red, green, blue), wire nuts, terminal blocks, splice joints, and staple/strap routing.
3. CONDUITS & RACEWAYS:
   - Electrical Metallic Tubing (EMT), Rigid PVC conduit, liquid-tight flexible metal conduit (LFMC), flexible metal conduit (FMC), conduit bends (90s, offsets, saddles), conduit hangers, straps, couplings, and weatherheads.
4. DEVICES, RECEPTACLES & SWITCHES:
   - GFCI/AFCI outlets, standard 15A/20A duplex receptacles, high-power 240V outlets (dryer/range), single-pole/three-way/dimmer switches, plastic/metal junction boxes, handy boxes, and faceplates.
5. FIXTURES & LIGHTING:
   - LED wafers, recessed cans, ceiling fans, ballast-driven lighting, industrial track lights, floodlights, and commercial emergency exit packs.
6. RENEWABLE, HEAVY MACHINERY & INDUSTRIAL:
   - Solar PV inverters (Enphase, SolarEdge, Fronius), EV chargers (Level 2 Tesla/ChargePoint wall connectors), backup generators (Generac), transfer switches, heavy industrial motor starters, VFD controllers, utility meters, and disconnect safety switches.

You must categorize the installation into one of these specific types:
- "Breakers & Panels"
- "Rough-In Wiring"
- "Conduits & Raceways"
- "Devices & Outlets"
- "Fixtures & Lighting"
- "Renewable & Specialized"
- "Non-Electrical / Skipped"

You must grade the craftsmanship neatness into one of these ratings:
- "Professional & Clean" (Perfect cable runs, neat panel dressing, right-angle bends)
- "Standard / Under Construction" (Ongoing standard field work, typical rough-in or trimout)
- "Needs Attention / Safety Concern" (Exposed conductors, messy panel routing, missing wire nuts, double-tapped breakers, overstuffed boxes)

Generate a clean descriptive lowercase filename with underscores including these keywords (e.g., electrical_breaker_panel_installation_residential_clean.jpg), and a concise 1-2 sentence description.
If the image does NOT contain electrical work, return isElectrical as false, and empty values for descriptiveName, electricalType, componentsDetected, and craftsmanshipRating.`;

async function analyzeImage(filePath: string): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const buffer = await fs.promises.readFile(filePath);
  const base64Data = buffer.toString("base64");
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },
      GEMINI_PROMPT,
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          isElectrical: {
            type: "BOOLEAN",
            description: "True if the photo contains electrical work.",
          },
          descriptiveName: {
            type: "STRING",
            description:
              "A descriptive file name (e.g. electrical_wiring_box_installation_commercial.jpg). Use lowercase, numbers, and underscores only. Must include descriptive keywords. If isElectrical is false, return empty string.",
          },
          description: {
            type: "STRING",
            description: "A 1-2 sentence description of what is seen in the photo.",
          },
          electricalType: {
            type: "STRING",
            description:
              "Must be one of: 'Breakers & Panels', 'Rough-In Wiring', 'Conduits & Raceways', 'Devices & Outlets', 'Fixtures & Lighting', 'Renewable & Specialized', or 'Other/General'. If not electrical, return empty string.",
          },
          componentsDetected: {
            type: "ARRAY",
            items: { type: "STRING" },
            description:
              "List of specific electrical components detected in the image. If not electrical, return empty array.",
          },
          craftsmanshipRating: {
            type: "STRING",
            description:
              "Must be one of: 'Professional & Clean', 'Standard / Under Construction', or 'Needs Attention / Safety Concern'. If not electrical, return empty string.",
          },
        },
        required: [
          "isElectrical",
          "descriptiveName",
          "description",
          "electricalType",
          "componentsDetected",
          "craftsmanshipRating",
        ],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("No response text from Gemini API");
  }

  return JSON.parse(text) as AnalysisResult;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // --- Health ---
  app.get("/health", (_req: any, res: any) => res.json({ ok: true }));

  // --- State store endpoints ---
  const stateModule = await import("./src/stateStore.js");
  const { stateStore } = stateModule;

  app.get("/api/config", (_req: any, res: any) => {
    res.json(stateStore.getConfig());
  });

  app.put("/api/config", (req: any, res: any) => {
    stateStore.updateConfig(req.body);
    res.json(stateStore.getConfig());
  });

  app.get("/api/results", (_req: any, res: any) => {
    res.json(stateStore.getResults());
  });

  app.get("/api/logs", (_req: any, res: any) => {
    res.json(stateStore.getLogs());
  });

  app.post("/api/results/clear", (_req: any, res: any) => {
    stateStore.clearResults();
    res.json({ ok: true });
  });

  // --- Scan endpoint ---
  app.post("/api/scan-local", async (req: any, res: any) => {
    try {
      const { filePath, filePaths } = req.body;

      const filesToScan: string[] = filePath ? [filePath] : (filePaths || []);
      if (!filesToScan || filesToScan.length === 0) {
        return res.status(400).json({ error: "No files provided for scanning" });
      }

      const results = [];

      for (const fp of filesToScan) {
        try {
          const result = await analyzeImage(fp);
          results.push({ filePath: fp, analysisResult: result });
        } catch (err: any) {
          results.push({
            filePath: fp,
            analysisResult: {
              isElectrical: false,
              descriptiveName: "",
              description: `Analysis failed: ${err.message}`,
              electricalType: "",
              componentsDetected: [],
              craftsmanshipRating: "",
            },
          });
        }
      }

      res.json({ results });
    } catch (error: any) {
      console.error("Error in scan-local:", error);
      res.status(500).json({ error: error.message || "Scan failed" });
    }
  });

  // --- Drive upload endpoint ---
  app.post("/api/upload-to-drive", async (req: any, res: any) => {
    try {
      const { accessToken, fileId, fileName, folderId } = req.body;

      if (!accessToken) {
        return res.status(400).json({ error: "Missing accessToken" });
      }

      const filePath = req.body.filePath;
      if (!filePath) {
        return res.status(400).json({ error: "Missing filePath" });
      }

      const buffer = await fs.promises.readFile(filePath);
      const blob = new Blob([buffer]);

      const metadata = {
        name: fileName,
        parents: folderId ? [folderId] : [],
      };

      const formData = new FormData();
      formData.append(
        "metadata",
        new Blob([JSON.stringify(metadata)], { type: "application/json" })
      );
      formData.append("file", blob);

      const uploadRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        }
      );

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(
          errData.error?.message || `Drive upload failed: ${uploadRes.statusText}`
        );
      }

      const uploaded = await uploadRes.json();
      res.json(uploaded);
    } catch (error: any) {
      console.error("Error in upload-to-drive:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  });

  // --- Vite middleware for development ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    (app as any).use((vite as any).middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: any, res: any) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", function () {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
