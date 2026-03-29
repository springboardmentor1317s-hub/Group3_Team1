const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const protect = require("../middleware/authMiddleware");
const {
  normalizeValue,
  escapeRegex,
  getCollegeScopedEvents
} = require("../utils/adminCollegeScope");

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
    endDate: obj.endDate || "",
    registrationDeadline: obj.registrationDeadline || "",
    teamSize: obj.teamSize ?? null,
    location: obj.location,
    organizer: obj.organizer,
    contact: obj.contact,
    description: obj.description,
    category: obj.category,
    posterDataUrl: obj.posterDataUrl ?? null,
    status: obj.status,
    participants: obj.participants ?? 0,
    registrations: registrationsCount,
    maxAttendees: obj.maxAttendees ?? null,
    collegeName: obj.collegeName,
    createdBy: obj.createdBy || "",
    createdById: obj.createdById || "",
    ownerId: obj.ownerId || "",
    adminId: obj.adminId || "",
    userId: obj.userId || "",
    email: obj.email || "",
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

function buildExactStringMatch(field, value) {
  const trimmed = normalizeValue(value);
  if (!trimmed) {
    return null;
  }

  return {
    [field]: { $regex: `^${escapeRegex(trimmed)}$`, $options: "i" }
  };
}

async function buildOwnershipFilter(userId) {
  if (!userId) {
    return null;
  }

  const user = await User.findById(userId).select("name email userId college").lean();
  if (!user) {
    return {
      strict: { $or: [] },
      fallback: { $or: [] }
    };
  }

  const strictCandidates = Array.from(new Set([
    normalizeValue(user._id),
    normalizeValue(user.userId),
    normalizeValue(user.email),
    normalizeValue(user.name)
  ].filter(Boolean)));

  const fallbackCandidates = Array.from(new Set([
    normalizeValue(user.name),
    normalizeValue(user.college)
  ].filter(Boolean)));

  const strictFilter = strictCandidates.flatMap((candidate) => ([
    buildExactStringMatch("createdById", candidate),
    buildExactStringMatch("ownerId", candidate),
    buildExactStringMatch("adminId", candidate),
    buildExactStringMatch("userId", candidate),
    buildExactStringMatch("email", candidate),
    buildExactStringMatch("createdBy", candidate)
  ].filter(Boolean)));

  const fallbackFilter = fallbackCandidates.flatMap((candidate) => ([
    buildExactStringMatch("createdBy", candidate),
    buildExactStringMatch("organizer", candidate)
  ].filter(Boolean)));

  if (normalizeValue(user.college)) {
    fallbackFilter.push(buildExactStringMatch("collegeName", user.college));
  }

  return {
    strict: { $or: strictFilter.filter(Boolean) },
    fallback: { $or: fallbackFilter.filter(Boolean) }
  };
}

async function appendRegistrationCounts(events, currentUserId) {
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

  return events.map((event) =>
    toClient(event, {
      registrationsCount: countMap.get(String(event._id)) || 0,
      registered: registeredSet.has(String(event._id))
    })
  );
}

// Get Events
router.get("/", async (req, res) => {
  try {
    const currentUserId = getUserIdFromRequest(req);
    const events = await Event.find().sort({ createdAt: -1 });
    res.json(await appendRegistrationCounts(events, currentUserId));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/mine", protect, async (req, res) => {
  try {
    const ownershipFilter = await buildOwnershipFilter(req.user?.id);
    let events = [];

    if (ownershipFilter?.strict?.$or?.length) {
      events = await Event.find(ownershipFilter.strict).sort({ createdAt: -1 });
    }

    if (!events.length && ownershipFilter?.fallback?.$or?.length) {
      events = await Event.find(ownershipFilter.fallback).sort({ createdAt: -1 });
    }

    res.json(await appendRegistrationCounts(events, String(req.user?.id || "")));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/college", protect, async (req, res) => {
  try {
    const events = await getCollegeScopedEvents(req.user?.id);
    res.json(await appendRegistrationCounts(events, String(req.user?.id || "")));
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

    const teamSizeValue = req.body?.teamSize;
    const maxAttendeesValue = req.body?.maxAttendees;

    const payload = {
      name,
      dateTime,
      endDate: String(req.body?.endDate ?? "").trim(),
      registrationDeadline: String(req.body?.registrationDeadline ?? "").trim(),
      location,
      organizer: String(req.body?.organizer ?? "").trim(),
      contact: String(req.body?.contact ?? "").trim(),
      description: String(req.body?.description ?? "").trim(),
      category,
      posterDataUrl: req.body?.posterDataUrl ?? null,
      status: String(req.body?.status ?? "Active").trim() || "Active",
      registrations: Number(req.body?.registrations ?? 0) || 0,
      participants: Number(req.body?.participants ?? 0) || 0,
      collegeName: String(req.body?.collegeName ?? "").trim(),
      createdBy: String(req.body?.createdBy ?? "").trim(),
      createdById: String(req.body?.createdById ?? "").trim(),
      ownerId: String(req.body?.ownerId ?? "").trim(),
      adminId: String(req.body?.adminId ?? "").trim(),
      userId: String(req.body?.userId ?? "").trim(),
      email: String(req.body?.email ?? "").trim(),
      teamSize: teamSizeValue === "" || teamSizeValue === null || teamSizeValue === undefined
        ? null
        : Number(teamSizeValue),
      maxAttendees: maxAttendeesValue === "" || maxAttendeesValue === null || maxAttendeesValue === undefined
        ? null
        : Number(maxAttendeesValue)
    };

    if (payload.teamSize !== null && (!Number.isFinite(payload.teamSize) || payload.teamSize < 1)) {
      return res.status(400).json({ error: "teamSize must be a positive number." });
    }

    if (payload.maxAttendees !== null && (!Number.isFinite(payload.maxAttendees) || payload.maxAttendees < 1)) {
      return res.status(400).json({ error: "maxAttendees must be a positive number." });
    }

    const newEvent = new Event(payload);
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

async function updateEvent(req, res) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const allowedFields = [
      "name",
      "dateTime",
      "endDate",
      "registrationDeadline",
      "location",
      "organizer",
      "contact",
      "description",
      "category",
      "posterDataUrl",
      "status",
      "teamSize",
      "collegeName",
      "maxAttendees",
      "createdBy",
      "createdById",
      "ownerId",
      "adminId",
      "userId",
      "email"
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const nextName = String(updates.name ?? event.name ?? "").trim();
    const nextDateTime = String(updates.dateTime ?? event.dateTime ?? "").trim();
    const nextLocation = String(updates.location ?? event.location ?? "").trim();
    const nextCategory = String(updates.category ?? event.category ?? "").trim();

    if (!nextName || !nextDateTime || !nextLocation || !nextCategory) {
      return res.status(400).json({ error: "Name, date, location, and category are required." });
    }

    if (updates.teamSize !== undefined) {
      if (updates.teamSize === "" || updates.teamSize === null) {
        updates.teamSize = null;
      } else {
        updates.teamSize = Number(updates.teamSize);
        if (!Number.isFinite(updates.teamSize) || updates.teamSize < 1) {
          return res.status(400).json({ error: "teamSize must be a positive number." });
        }
      }
    }

    if (updates.maxAttendees !== undefined) {
      if (updates.maxAttendees === "" || updates.maxAttendees === null) {
        updates.maxAttendees = null;
      } else {
        updates.maxAttendees = Number(updates.maxAttendees);
        if (!Number.isFinite(updates.maxAttendees) || updates.maxAttendees < 1) {
          return res.status(400).json({ error: "maxAttendees must be a positive number." });
        }
      }
    }

    const updated = await Event.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });

    if (!updated) return res.status(404).json({ message: "Event not found" });

    const registrationsCount = await Registration.countDocuments({
      eventId: String(updated._id),
      status: { $ne: "REJECTED" }
    });

    res.json(
      toClient(updated, {
        registrationsCount
      })
    );
  } catch (error) {
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    res.status(statusCode).json({ error: error.message });
  }
}

// Update Event
router.put("/:id", updateEvent);
router.patch("/:id", updateEvent);

module.exports = router;
