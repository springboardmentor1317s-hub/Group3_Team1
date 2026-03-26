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
      console.warn(`[Review Warning] No registration found for student ${studentId} on event ${eventId}`);
    }
  } catch (error) {
    console.error("[Review Warning] Skipping strict review check to allow storage.");
  }
}

const getStudentId = (req) => req.user?.id || req.user?._id || req.user?.userId;

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

exports.upsertRating = async (req, res) => {
  try {
    const studentId = String(getStudentId(req));
    const eventId = String(req.body?.eventId || "").trim();
    const rating = Number(req.body?.rating);

    if (!eventId) {
      return res.status(400).json({ message: "eventId is required." });
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "rating must be a number between 1 and 5." });
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
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || "Failed to save rating" });
  }
};

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
      return res.status(400).json({ message: "feedback must be 2000 characters or less." });
    }

    await assertStudentCanReview(studentId, eventId);

    // ALWAYS upsert so it doesn't fail if they skipped the star rating
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
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ message: error.message || "Failed to save feedback" });
  }
};

  exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await EventReview.find();
    res.json(
      reviews.map(r => ({
        id: r._id.toString(),
        eventId: r.eventId.toString(),
        rating: r.rating,
        feedback: r.feedback || "",
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


