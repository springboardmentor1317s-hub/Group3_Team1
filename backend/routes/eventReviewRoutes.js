const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");

const controller = require("../controllers/eventReviewController");

router.get("/mine", protect, controller.getMyReviews);
router.post("/rating", protect, controller.upsertRating);
router.post("/feedback", protect, controller.upsertFeedback);

// NEW: College admin views ratings for their completed events
// GET /api/event-reviews/admin/event-ratings?collegeName=XYZ
router.get("/admin/event-ratings", protect, controller.getEventRatingsForAdmin);

module.exports = router;