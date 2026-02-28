const express = require("express");
const router = express.Router();
const Event = require("../models/Event");

function toClient(eventDoc) {
  const obj = eventDoc.toObject({ versionKey: false });
  return {
    id: obj._id.toString(),
    name: obj.name,
    dateTime: obj.dateTime,
    location: obj.location,
    organizer: obj.organizer,
    contact: obj.contact,
    description: obj.description,
    posterDataUrl: obj.posterDataUrl ?? null,
    status: obj.status,
    registrations: obj.registrations ?? 0,
    participants: obj.participants ?? 0
  };
}

// Get Events
router.get("/events", async (_req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json(events.map(toClient));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Event
router.post("/events", async (req, res) => {
  try {
    const newEvent = new Event(req.body);
    const created = await newEvent.save();
    res.status(201).json(toClient(created));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Event
router.delete("/events/:id", async (req, res) => {
  try {
    const deleted = await Event.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Event not found" });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
