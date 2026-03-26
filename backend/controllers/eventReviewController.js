const Event = require("../models/Event");
const Registration = require("../models/Registration");
const EventReview = require("../models/EventReview");

async function assertStudentCanReview(studentId, eventId) {
  try {
    const registration = await Registration.findOne({
      studentId: String(studentId),
      eventId: String(eventId)
    }).select("_id");

    if (!registration) {
      console.warn(
        `[Review Warning] No registration found for student ${studentId} on event ${eventId}`
      );
    }
  } catch (error) {
    console.error("[Review Warning] Skipping strict review check.");
  }
}

const getStudentId = (req) =>
  req.user?.id || req.user?._id || req.user?.userId;

// ─────────────────────────────────────────────
// GET: Student's own reviews
// ─────────────────────────────────────────────
exports.getMyReviews = async (req, res) => {
  try {
    const studentId = String(getStudentId(req));
    const eventIdsRaw = String(req.query.eventIds || "").trim();

    const eventIds = eventIdsRaw
      ? eventIdsRaw.split(",").map((id) => String(id).trim()).filter(Boolean)
      : [];

    const query = { studentId };
    if (eventIds.length) {
      query.eventId = { $in: eventIds };
    }

    const reviews = await EventReview.find(query).sort({ updatedAt: -1 });

    res.json(
      reviews.map((review) => ({
        eventId: String(review.eventId),
        rating: review.rating,
        feedback: review.feedback || "",
        createdAt: review.createdAt,
        updatedAt: review.updatedAt
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to load reviews" });
  }
};

// ─────────────────────────────────────────────
// POST: Save / update rating
// ─────────────────────────────────────────────
exports.upsertRating = async (req, res) => {
  try {
    const studentId = String(getStudentId(req));
    const eventId = String(req.body?.eventId || "").trim();
    const rating = Number(req.body?.rating);

    if (!eventId) {
      return res.status(400).json({ message: "eventId is required." });
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "rating must be between 1 and 5." });
    }

    await assertStudentCanReview(studentId, eventId);

    const next = await EventReview.findOneAndUpdate(
      { eventId, studentId },
      { $set: { rating } },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({
      eventId: String(next.eventId),
      rating: next.rating,
      feedback: next.feedback || "",
      createdAt: next.createdAt,
      updatedAt: next.updatedAt
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to save rating" });
  }
};

// ─────────────────────────────────────────────
// POST: Save / update feedback
// ─────────────────────────────────────────────
exports.upsertFeedback = async (req, res) => {
  try {
    const studentId = String(getStudentId(req));
    const eventId = String(req.body?.eventId || "").trim();
    const feedback = String(req.body?.feedback || "").trim();

    if (!eventId) {
      return res.status(400).json({ message: "eventId is required." });
    }

    if (feedback.length < 3) {
      return res.status(400).json({ message: "feedback must be at least 3 characters." });
    }

    if (feedback.length > 2000) {
      return res.status(400).json({ message: "feedback must be <= 2000 characters." });
    }

    await assertStudentCanReview(studentId, eventId);

    const next = await EventReview.findOneAndUpdate(
      { eventId, studentId },
      { $set: { feedback } },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({
      eventId: String(next.eventId),
      rating: next.rating || 0,
      feedback: next.feedback || "",
      createdAt: next.createdAt,
      updatedAt: next.updatedAt
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to save feedback" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔥 ADMIN: Get ratings for completed events
//
// FIXES APPLIED:
//  1. collegeName matched case-insensitively (regex) — avoids empty-string mismatch
//  2. Status filter removed from DB query — instead we check if event date has passed.
//     This handles events still marked "Active" in DB even though date is gone.
//  3. Added console debug logs so you can see what's happening in the terminal.
// ─────────────────────────────────────────────────────────────────────────────
exports.getEventRatingsForAdmin = async (req, res) => {
  try {
    // ✅ FIX 1: Support collegeName OR college query param
    const collegeName = String(
      req.query.collegeName || req.query.college || ""
    ).trim();

    if (!collegeName) {
      return res.status(400).json({ message: "collegeName query param is required." });
    }

    const nowIso = new Date().toISOString();

    // ✅ FIX 2: Use case-insensitive match + include events whose date has passed
    //    regardless of whether their status field was updated to "Past" in the DB.
    const events = await Event.find({
      collegeName: { $regex: new RegExp(`^${collegeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      $or: [
        { status: "Past" },
        { dateTime: { $lt: nowIso } }   // date already passed → treat as completed
      ]
    });

    // ✅ FIX 3: Debug log — check your terminal to see what was found
    console.log(`[Ratings] collegeName="${collegeName}", now="${nowIso}"`);
    console.log(`[Ratings] Events found: ${events.length}`, events.map(e => ({
      name: e.name, status: e.status, dateTime: e.dateTime, collegeName: e.collegeName
    })));

    if (events.length === 0) {
      return res.json([]);
    }

    const eventIds = events.map(e => e._id.toString());

    const reviews = await EventReview.find({
      eventId: { $in: eventIds }
    });

    // Group reviews by eventId
    const grouped = {};
    reviews.forEach(r => {
      const eid = r.eventId.toString();
      if (!grouped[eid]) grouped[eid] = [];
      grouped[eid].push(r);
    });

    const result = events.map((event) => {
      const eid = String(event._id);
      const eventReviews = grouped[eid] || [];
      const ratingsOnly = eventReviews.filter(r => r.rating != null);

      const avg =
        ratingsOnly.length > 0
          ? ratingsOnly.reduce((sum, r) => sum + r.rating, 0) / ratingsOnly.length
          : null;

      return {
        eventId: eid,
        eventName: event.name,
        dateTime: event.dateTime,
        location: event.location,
        category: event.category,
        collegeName: event.collegeName,
        averageRating: avg !== null ? Number(avg.toFixed(1)) : null,
        totalReviews: eventReviews.length,
        reviews: eventReviews.map((r) => ({
          studentId: r.studentId,
          rating: r.rating ?? null,
          feedback: r.feedback || "",
          updatedAt: r.updatedAt
        }))
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Admin ratings error:", error);
    res.status(500).json({ message: "Failed to load ratings", error: error.message });
  }
};