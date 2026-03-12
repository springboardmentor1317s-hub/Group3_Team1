const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const jwt = require("jsonwebtoken");
const protect = require("../middleware/authMiddleware");

function toClient(eventDoc, currentUserId = null) {
  const obj = eventDoc.toObject({ versionKey: false });
  const attendeeIds = obj.attendeeIds ?? [];

  return {
    id: obj._id.toString(),
    name: obj.name,
    dateTime: obj.dateTime,
    location: obj.location,
    organizer: obj.organizer,
    contact: obj.contact,
    description: obj.description,
    category: obj.category,
    posterDataUrl: obj.posterDataUrl ?? null,
    status: obj.status,
    participants: obj.participants ?? 0,
    registrations: attendeeIds.length,
    maxAttendees: obj.maxAttendees || 100,
    collegeName: obj.collegeName,
    attendeeIds,
    registered: currentUserId
      ? attendeeIds.some((id) => String(id) === String(currentUserId))
      : false
  };
}

function getUserIdFromRequest(req) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id ? String(decoded.id) : null;
  } catch {
    return null;
  }
}

// Get Events
router.get("/", async (req, res) => {
  try {
    const currentUserId = getUserIdFromRequest(req);
    const events = await Event.find().sort({ createdAt: -1 });
    res.json(events.map((event) => toClient(event, currentUserId)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Event
router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const dateTime = String(req.body?.dateTime ?? "").trim();
    const location = String(req.body?.location ?? "").trim();
    const category = String(req.body?.category ?? "").trim();

    if (!name || !dateTime || !location || !category) {
      return res.status(400).json({ error: "Name, date, location, and category are required." });
    }

    const newEvent = new Event(req.body);
    const created = await newEvent.save();
    res.status(201).json(toClient(created));
  } catch (error) {
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

// TOGGLE Registration (Authenticated)
router.post("/toggle/:id", protect, async (req, res) => {
  try {
    const eventId = req.params.id;
    const studentIdentifier = String(req.user.id);

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    if (!event.attendeeIds) event.attendeeIds = [];

    const index = event.attendeeIds.findIndex((id) => String(id) === studentIdentifier);
    if (index > -1) {
      event.attendeeIds.splice(index, 1);
    } else {
      if (event.maxAttendees && event.attendeeIds.length >= event.maxAttendees) {
        return res.status(400).json({ message: "Event is full" });
      }
      event.attendeeIds.push(studentIdentifier);
    }

    event.registrations = event.attendeeIds.length;
    await event.save({ validateBeforeSave: false });

    res.json(toClient(event, studentIdentifier));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Event
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Event.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Event not found" });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
