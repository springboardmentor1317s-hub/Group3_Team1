const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const controller = require("../controllers/eventCommentController");

router.get("/notifications/me", protect, controller.getMyReplyNotifications);
router.get("/event/:eventId", protect, controller.getEventComments);
router.post("/", protect, controller.createComment);
router.put("/:commentId", protect, controller.updateComment);
router.delete("/:commentId", protect, controller.deleteComment);
router.post("/:commentId/like", protect, controller.toggleLike);

module.exports = router;
