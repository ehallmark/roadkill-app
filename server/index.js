const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27018";
const DB_NAME = "roadkill";
const COLLECTION = "sightings";

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  db = client.db(DB_NAME);
  console.log("Connected to MongoDB");
}

// GET /sightings — list all, newest first
app.get("/sightings", async (req, res) => {
  try {
    const sightings = await db
      .collection(COLLECTION)
      .find()
      .sort({ timestamp: -1 })
      .toArray();

    const result = sightings.map((doc) => ({
      id: doc._id.toString(),
      animal: doc.animal,
      latitude: doc.latitude,
      longitude: doc.longitude,
      address: doc.address || null,
      timestamp: doc.timestamp,
      notes: doc.notes || null,
    }));

    res.json(result);
  } catch (err) {
    console.error("GET /sightings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /sightings — create a new sighting
app.post("/sightings", async (req, res) => {
  try {
    const { animal, latitude, longitude, address, timestamp, notes } = req.body;

    if (!animal || latitude == null || longitude == null) {
      return res
        .status(400)
        .json({ error: "animal, latitude, and longitude are required" });
    }

    const doc = {
      animal,
      latitude,
      longitude,
      address: address || null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      notes: notes || null,
    };

    const result = await db.collection(COLLECTION).insertOne(doc);
    res.status(201).json({ id: result.insertedId.toString() });
  } catch (err) {
    console.error("POST /sightings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /sightings/:id — delete a sighting
app.delete("/sightings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /sightings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Roadkill API server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
