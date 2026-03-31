const Notification = require("../models/Notification");
const User = require("../models/User");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const StudentQuery = require("../models/StudentQuery");
const { buildReplyNotificationsForUser } = require("../controllers/eventCommentController");
const { getCollegeScopedEventIds } = require("../utils/adminCollegeScope");

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(role) {
  const value = normalizeText(role);
  if (value === "admin" || value === "college_admin") {
    return "admin";
  }
  return "student";
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toDate(value) {
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function serializeNotification(notification) {
  return {
    id: String(notification._id),
    userId: String(notification.userId || ""),
    role: String(notification.role || ""),
    title: String(notification.title || ""),
    message: String(notification.message || ""),
    icon: String(notification.icon || "notifications"),
    tone: String(notification.tone || "info"),
    category: String(notification.category || "general"),
    isSeen: Boolean(notification.isSeen),
    createdAt: notification.createdAt instanceof Date
      ? notification.createdAt.toISOString()
      : new Date(notification.createdAt || Date.now()).toISOString()
  };
}

function buildStudentSeeds(user, registrations, events, supportQueries, commentNotifications) {
  const notifications = [];
  const userCollege = normalizeText(user?.college);
  const now = Date.now();

  notifications.push({
    sourceKey: `student-overview-${String(user?._id || user?.id || "")}`,
    sourceType: "dashboard-overview",
    title: "Dashboard overview",
    message: `You have ${registrations.length} registrations and ${registrations.filter((item) => item.status === "APPROVED").length} approved entries right now.`,
    icon: "insights",
    tone: registrations.some((item) => item.status === "APPROVED") ? "success" : "info",
    category: "overview",
    createdAt: new Date()
  });

  for (const registration of registrations || []) {
    const eventName = String(registration.eventName || "your event");
    const status = String(registration.status || "PENDING").toUpperCase();

    if (status === "APPROVED") {
      notifications.push({
        sourceKey: `student-registration-approved-${registration._id}`,
        sourceType: "registration",
        title: "Registration approved",
        message: `${eventName} has been approved for you.`,
        icon: "verified",
        tone: "success",
        category: "approval",
        createdAt: registration.approvedAt || registration.updatedAt || registration.createdAt
      });
      continue;
    }

    if (status === "REJECTED") {
      notifications.push({
        sourceKey: `student-registration-rejected-${registration._id}`,
        sourceType: "registration",
        title: "Registration update",
        message: registration.rejectionReason
          ? `${eventName} was declined: ${registration.rejectionReason}`
          : `${eventName} was declined by the admin.`,
        icon: "report_problem",
        tone: "warning",
        category: "approval",
        createdAt: registration.rejectedAt || registration.updatedAt || registration.createdAt
      });
      continue;
    }

    if (now - toDate(registration.createdAt).getTime() <= 1000 * 60 * 60 * 24 * 14) {
      notifications.push({
        sourceKey: `student-registration-pending-${registration._id}`,
        sourceType: "registration",
        title: "Registration received",
        message: `${eventName} is waiting for admin approval.`,
        icon: "hourglass_top",
        tone: "info",
        category: "registration",
        createdAt: registration.createdAt
      });
    }
  }

  for (const event of (events || [])
    .filter((item) => String(item.status || "").toLowerCase() !== "past")
    .filter((item) => {
      if (!userCollege) return true;
      const collegeName = normalizeText(item.collegeName);
      const organizer = normalizeText(item.organizer);
      return collegeName === userCollege || organizer.includes(userCollege);
    })
    .slice(0, 6)) {
    notifications.push({
      sourceKey: `student-event-live-${event._id}`,
      sourceType: "event",
      title: userCollege ? "New event from your college" : "Live campus event",
      message: `${event.name} is live now${event.location ? ` at ${event.location}` : ""}.`,
      icon: "campaign",
      tone: "info",
      category: "event",
      createdAt: event.createdAt || event.dateTime || new Date()
    });
  }

  for (const query of supportQueries || []) {
    if (query.adminResponse && query.adminResponseUpdatedAt) {
      notifications.push({
        sourceKey: `student-query-reply-${query._id}`,
        sourceType: "query",
        title: "Reply on your query",
        message: query.subject
          ? `Admin replied to your query: ${query.subject}`
          : "Admin replied to your support query.",
        icon: "support_agent",
        tone: "info",
        category: "approval",
        createdAt: query.adminResponseUpdatedAt
      });
    }

    if (String(query.status || "").toUpperCase() === "RESOLVED") {
      notifications.push({
        sourceKey: `student-query-resolved-${query._id}`,
        sourceType: "query",
        title: "Query resolved",
        message: query.subject
          ? `Your query has been marked resolved: ${query.subject}`
          : "Your support query has been marked resolved.",
        icon: "task_alt",
        tone: "success",
        category: "approval",
        createdAt: query.updatedAt || query.createdAt
      });
    }
  }

  for (const notification of commentNotifications || []) {
    notifications.push({
      sourceKey: `student-comment-reply-${notification.id}`,
      sourceType: "comment",
      title: String(notification.title || "New reply"),
      message: String(notification.message || ""),
      icon: String(notification.icon || "forum"),
      tone: String(notification.tone || "info"),
      category: String(notification.category || "comment"),
      createdAt: notification.createdAt || new Date()
    });
  }

  return notifications;
}

function buildAdminSeeds(registrations, queries, commentNotifications) {
  const notifications = [];

  for (const registration of registrations || []) {
    notifications.push({
      sourceKey: `admin-registration-${registration._id}`,
      sourceType: "registration",
      title: "New registration received",
      message: `${registration.studentName} registered for ${registration.eventName}`,
      icon: "notifications_active",
      tone: "info",
      category: "registration",
      createdAt: registration.createdAt
    });
  }

  for (const query of queries || []) {
    notifications.push({
      sourceKey: `admin-query-${query._id}`,
      sourceType: "query",
      title: "New student query",
      message: `${query.studentName} asked: ${query.subject || "Support Query"}`,
      icon: "live_help",
      tone: "info",
      category: "query",
      createdAt: query.createdAt
    });
  }

  for (const notification of commentNotifications || []) {
    notifications.push({
      sourceKey: `admin-comment-reply-${notification.id}`,
      sourceType: "comment",
      title: String(notification.title || "New reply"),
      message: String(notification.message || ""),
      icon: String(notification.icon || "forum"),
      tone: String(notification.tone || "info"),
      category: String(notification.category || "comment"),
      createdAt: notification.createdAt || new Date()
    });
  }

  return notifications;
}

async function buildSeedsForUser(user) {
  const role = normalizeRole(user?.role);
  const userId = String(user?._id || user?.id || "");

  if (!userId) {
    return { role, seeds: [] };
  }

  if (role === "student") {
    const [registrations, events, supportQueries, commentNotifications] = await Promise.all([
      Registration.find({ studentId: userId }).sort({ createdAt: -1 }).lean(),
      Event.find().sort({ createdAt: -1 }).lean(),
      StudentQuery.find({ student: userId, deletedAt: null }).sort({ updatedAt: -1 }).limit(10).lean(),
      buildReplyNotificationsForUser(userId, 50)
    ]);

    return {
      role,
      seeds: buildStudentSeeds(user, registrations, events, supportQueries, commentNotifications)
    };
  }

  const eventIds = await getCollegeScopedEventIds(userId);
  const collegeRegex = user?.college
    ? new RegExp(`^${escapeRegex(String(user.college || "").trim())}$`, "i")
    : null;

  const [registrations, queries, commentNotifications] = await Promise.all([
    eventIds.length
      ? Registration.find({ eventId: { $in: eventIds } }).sort({ createdAt: -1 }).lean()
      : [],
    collegeRegex
      ? StudentQuery.find({ deletedAt: null, studentCollege: collegeRegex }).sort({ createdAt: -1 }).lean()
      : [],
    buildReplyNotificationsForUser(userId, 50)
  ]);

  return {
    role,
    seeds: buildAdminSeeds(registrations, queries, commentNotifications)
  };
}

async function syncNotificationsForUser(userId) {
  const user = await User.findById(userId).select("role college").lean();
  if (!user) {
    return { role: "student", seeds: [] };
  }

  const { role, seeds } = await buildSeedsForUser({ ...user, _id: userId });
  const normalizedUserId = String(userId);

  if (seeds.length) {
    const now = new Date();
    await Notification.bulkWrite(
      seeds.map((seed) => ({
        updateOne: {
          filter: {
            userId: normalizedUserId,
            role,
            sourceKey: seed.sourceKey
          },
          update: {
            $set: {
              sourceType: seed.sourceType,
              title: seed.title,
              message: seed.message,
              icon: seed.icon,
              tone: seed.tone,
              category: seed.category,
              createdAt: toDate(seed.createdAt),
              updatedAt: now
            },
            $setOnInsert: {
              userId: normalizedUserId,
              role,
              isSeen: false,
              deletedAt: null
            }
          },
          upsert: true
        }
      })),
      { ordered: false }
    );
  }

  return { role, seeds };
}

async function getNotificationsForUser(userId, options = {}) {
  const normalizedUserId = String(userId || "");
  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit || 15)));
  const unseenOnly = options.unseenOnly === true;
  const skip = (page - 1) * limit;

  const { role } = await syncNotificationsForUser(normalizedUserId);

  const baseFilter = {
    userId: normalizedUserId,
    role,
    deletedAt: null
  };

  if (unseenOnly) {
    baseFilter.isSeen = false;
  }

  const [items, total, unseenCount] = await Promise.all([
    Notification.find(baseFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(baseFilter),
    Notification.countDocuments({
      userId: normalizedUserId,
      role,
      deletedAt: null,
      isSeen: false
    })
  ]);

  return {
    items: items.map(serializeNotification),
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
    unseenCount
  };
}

async function getUnseenNotificationCount(userId) {
  const normalizedUserId = String(userId || "");
  const { role } = await syncNotificationsForUser(normalizedUserId);
  return Notification.countDocuments({
    userId: normalizedUserId,
    role,
    deletedAt: null,
    isSeen: false
  });
}

async function markAllNotificationsSeen(userId) {
  const normalizedUserId = String(userId || "");
  const { role } = await syncNotificationsForUser(normalizedUserId);
  await Notification.updateMany(
    { userId: normalizedUserId, role, deletedAt: null, isSeen: false },
    { $set: { isSeen: true, updatedAt: new Date() } }
  );
}

async function markNotificationsSeenState(userId, ids, isSeen) {
  const normalizedUserId = String(userId || "");
  const { role } = await syncNotificationsForUser(normalizedUserId);
  const normalizedIds = (ids || [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^[0-9a-fA-F]{24}$/.test(id));

  if (!normalizedIds.length) {
    return 0;
  }

  const result = await Notification.updateMany(
    {
      _id: { $in: normalizedIds },
      userId: normalizedUserId,
      role,
      deletedAt: null
    },
    { $set: { isSeen: Boolean(isSeen), updatedAt: new Date() } }
  );

  return Number(result.modifiedCount || 0);
}

async function deleteNotificationById(userId, id) {
  const normalizedUserId = String(userId || "");
  const { role } = await syncNotificationsForUser(normalizedUserId);
  if (!/^[0-9a-fA-F]{24}$/.test(String(id || ""))) {
    return false;
  }

  const result = await Notification.updateOne(
    {
      _id: String(id),
      userId: normalizedUserId,
      role,
      deletedAt: null
    },
    { $set: { deletedAt: new Date(), updatedAt: new Date() } }
  );

  return Number(result.modifiedCount || 0) > 0;
}

async function deleteNotifications(userId, ids, deleteAll = false, unseenOnly = false) {
  const normalizedUserId = String(userId || "");
  const { role } = await syncNotificationsForUser(normalizedUserId);
  const filter = {
    userId: normalizedUserId,
    role,
    deletedAt: null
  };

  if (unseenOnly) {
    filter.isSeen = false;
  }

  if (!deleteAll) {
    const normalizedIds = (ids || [])
      .map((id) => String(id || "").trim())
      .filter((id) => /^[0-9a-fA-F]{24}$/.test(id));

    if (!normalizedIds.length) {
      return 0;
    }

    filter._id = { $in: normalizedIds };
  }

  const result = await Notification.updateMany(
    filter,
    { $set: { deletedAt: new Date(), updatedAt: new Date() } }
  );

  return Number(result.modifiedCount || 0);
}

module.exports = {
  getNotificationsForUser,
  getUnseenNotificationCount,
  markAllNotificationsSeen,
  markNotificationsSeenState,
  deleteNotificationById,
  deleteNotifications,
  syncNotificationsForUser
};
