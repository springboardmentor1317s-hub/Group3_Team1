const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const jwt = require("jsonwebtoken");
const protect = require("../middleware/authMiddleware");

function toClient(eventDoc, options = {}) {
  const obj = eventDoc.toObject({ versionKey: false });
  const attendeeIds = obj.attendeeIds ?? [];
  const registrationsCount = typeof options.registrationsCount === "number"
    ? options.registrationsCount
    : attendeeIds.length;
  const isRegistered = typeof options.registered === "boolean"
    ? options.registered
    : false;

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
    registrations: registrationsCount,
    maxAttendees: obj.maxAttendees || 100,
    collegeName: obj.collegeName,
    attendeeIds,
    registered: isRegistered
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

    const eventIds = events.map((event) => String(event._id));

    const registrationCounts = await Registration.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          status: { $ne: "REJECTED" }
        }
      },
      {
        $group: {
          _id: "$eventId",
          count: { $sum: 1 }
        }
      }
    ]);

    const countMap = new Map(
      registrationCounts.map((row) => [String(row._id), row.count])
    );

    let registeredSet = new Set();
    if (currentUserId) {
      const userRegs = await Registration.find({
        studentId: String(currentUserId),
        eventId: { $in: eventIds },
        status: { $ne: "REJECTED" }
      }).select("eventId");
      registeredSet = new Set(userRegs.map((r) => String(r.eventId)));
    }

    res.json(
      events.map((event) =>
        toClient(event, {
          registrationsCount: countMap.get(String(event._id)) || 0,
          registered: registeredSet.has(String(event._id))
        })
      )
    );
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
