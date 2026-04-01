const express = require("express");
const protect = require("../middleware/authMiddleware");
const controller = require("../controllers/notificationController");

const router = express.Router();

router.get("/", protect, controller.getNotifications);
router.get("/unseen-count", protect, controller.getUnseenCount);
router.put("/mark-all-seen", protect, controller.markAllSeen);
router.patch("/mark", protect, controller.markSeenState);
router.delete("/:id", protect, controller.deleteSingleNotification);
router.delete("/", protect, controller.deleteBulkNotifications);

module.exports = router;
