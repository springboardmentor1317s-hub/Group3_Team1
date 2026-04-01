const {
  getNotificationsForUser,
  getUnseenNotificationCount,
  markAllNotificationsSeen,
  markNotificationsSeenState,
  deleteNotificationById,
  deleteNotifications
} = require("../services/notificationService");

exports.getNotifications = async (req, res) => {
  try {
    const page = Number(req.query?.page || 1);
    const limit = Number(req.query?.limit || 15);
    const unseenOnly = String(req.query?.unseenOnly || "").toLowerCase() === "true";
    const payload = await getNotificationsForUser(req.user?.id, { page, limit, unseenOnly });
    res.json(payload);
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ message: "Failed to fetch notifications." });
  }
};

exports.getUnseenCount = async (req, res) => {
  try {
    const count = await getUnseenNotificationCount(req.user?.id);
    res.json({ unseenCount: count });
  } catch (error) {
    console.error("Get unseen notification count error:", error);
    res.status(500).json({ message: "Failed to fetch unseen notification count." });
  }
};

exports.markAllSeen = async (req, res) => {
  try {
    await markAllNotificationsSeen(req.user?.id);
    res.json({ message: "Notifications marked as seen." });
  } catch (error) {
    console.error("Mark all notifications seen error:", error);
    res.status(500).json({ message: "Failed to mark notifications as seen." });
  }
};

exports.markSeenState = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const isSeen = Boolean(req.body?.isSeen);
    const updated = await markNotificationsSeenState(req.user?.id, ids, isSeen);
    res.json({ message: "Notification state updated.", updated });
  } catch (error) {
    console.error("Mark notifications read/unread error:", error);
    res.status(500).json({ message: "Failed to update notification state." });
  }
};

exports.deleteSingleNotification = async (req, res) => {
  try {
    const deleted = await deleteNotificationById(req.user?.id, req.params?.id);
    if (!deleted) {
      return res.status(404).json({ message: "Notification not found." });
    }
    res.json({ message: "Notification deleted." });
  } catch (error) {
    console.error("Delete single notification error:", error);
    res.status(500).json({ message: "Failed to delete notification." });
  }
};

exports.deleteBulkNotifications = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const deleteAll = req.body?.deleteAll === true;
    const unseenOnly = req.body?.unseenOnly === true;
    const deleted = await deleteNotifications(req.user?.id, ids, deleteAll, unseenOnly);
    res.json({ message: "Notifications deleted.", deleted });
  } catch (error) {
    console.error("Delete bulk notifications error:", error);
    res.status(500).json({ message: "Failed to delete notifications." });
  }
};
