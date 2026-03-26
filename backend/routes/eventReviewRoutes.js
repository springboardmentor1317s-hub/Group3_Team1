const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");

const controller = require("../controllers/eventReviewController");

router.get("/mine", protect, controller.getMyReviews);
router.get("/event/:eventId", protect, controller.getEventReviewsByEventId);
router.get("/summary", protect, controller.getEventRatingSummaries);
router.post("/rating", protect, controller.upsertRating);
router.post("/feedback", protect, controller.upsertFeedback);

module.exports = router;

