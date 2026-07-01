import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Route for image analysis
  app.post("/api/analyze-image", async (req: any, res: any) => {
    try {
      const { baseUrl, mimeType, filename } = req.body;
      if (!baseUrl) {
        return res.status(400).json({ error: "Missing baseUrl" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      // Fetch the photo from the Google Photos baseUrl.
      // Append =w1024 to get a high-enough resolution for analysis, yet fast to download.
      const cleanedBaseUrl = baseUrl.split("=")[0];
      const photoUrl = `${cleanedBaseUrl}=w1024`;

      const photoRes = await fetch(photoUrl);
      if (!photoRes.ok) {
        throw new Error(`Failed to fetch photo from Google Photos baseUrl: ${photoRes.statusText}`);
      }

      const arrayBuffer = await photoRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Data = buffer.toString("base64");

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are an expert master electrician and AI Vision Analyst. Your task is to analyze the provided image and determine with high confidence if it depicts electrical work.

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
- "Standard / Under Construction" (Ongoing standard field work, typical rough-in or trim-out)
- "Needs Attention / Safety Concern" (Exposed conductors, messy panel routing, missing wire nuts, double-tapped breakers, overstuffed boxes)

Generate a clean descriptive lowercase filename with underscores including these keywords (e.g., electrical_breaker_panel_installation_residential_clean.jpg), and a concise 1-2 sentence description.
If the image does NOT contain electrical work, return isElectrical as false, and empty values for descriptiveName, electricalType, componentsDetected, and craftsmanshipRating.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType || "image/jpeg",
            }
          },
          prompt
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              isElectrical: {
                type: "BOOLEAN",
                description: "True if the photo contains electrical work. False otherwise."
              },
              descriptiveName: {
                type: "STRING",
                description: "A descriptive file name (e.g. electrical_wiring_box_installation_commercial.jpg). Use lowercase, numbers, and underscores only. Must include descriptive keywords. If isElectrical is false, return empty string."
              },
              description: {
                type: "STRING",
                description: "A 1-2 sentence description of what is seen in the photo."
              },
              electricalType: {
                type: "STRING",
                description: "Must be one of: 'Breakers & Panels', 'Rough-In Wiring', 'Conduits & Raceways', 'Devices & Outlets', 'Fixtures & Lighting', 'Renewable & Specialized', or 'Other/General'. If not electrical, return empty string."
              },
              componentsDetected: {
                type: "ARRAY",
                items: { type: "STRING" },
                description: "List of specific electrical components detected in the image (e.g., 'Eaton Breaker', 'EMT Conduit', 'Romex Cable', 'GFCI Outlet', 'Tesla EV Charger'). If not electrical, return empty array."
              },
              craftsmanshipRating: {
                type: "STRING",
                description: "Must be one of: 'Professional & Clean', 'Standard / Under Construction', or 'Needs Attention / Safety Concern'. If not electrical, return empty string."
              }
            },
            required: ["isElectrical", "descriptiveName", "description", "electricalType", "componentsDetected", "craftsmanshipRating"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response text from Gemini API");
      }

      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error("Error analyzing image:", error);
      res.status(500).json({ error: error.message || "Failed to analyze image" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
