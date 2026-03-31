const EventComment = require("../models/EventComment");
const Event = require("../models/Event");
const User = require("../models/User");

const getStudentId = (req) => String(req.user?.id || req.user?._id || req.user?.userId || "");
const isAdminRole = (role) => {
  const normalizedRole = String(role || "").trim().toLowerCase();
  return normalizedRole === "admin" || normalizedRole === "college_admin";
};

async function getUserProfile(userId) {
  const user = await User.findById(userId).select("name userId profileImageUrl role");
  if (!user) {
    return {
      studentId: userId,
      studentName: "Student",
      profilePhotoUrl: "",
      role: "student",
      authorUserCode: "",
      adminBadgeLabel: ""
    };
  }

  const role = String(user.role || "student").trim().toLowerCase();
  const baseName = String(user.name || "Student").trim();

  return {
    studentId: String(user._id),
    studentName: baseName,
    profilePhotoUrl: String(user.profileImageUrl || ""),
    role,
    authorUserCode: String(user.userId || "").trim(),
    adminBadgeLabel: isAdminRole(role) ? "College Admin" : ""
  };
}

function mapComment(comment) {
  const authorRole = String(comment.authorRole || "").trim().toLowerCase() || "student";
  const fallbackAdmin = authorRole.includes("admin") || /^admin\b/i.test(String(comment.studentName || "").trim());
  return {
    id: String(comment._id),
    eventId: String(comment.eventId),
    parentCommentId: comment.parentCommentId ? String(comment.parentCommentId) : null,
    authorId: String(comment.studentId),
    name: String(comment.studentName || "Student"),
    authorRole,
    authorUserCode: String(comment.authorUserCode || ""),
    adminBadgeLabel: String(comment.adminBadgeLabel || (fallbackAdmin ? "College Admin" : "")),
    isAdminAuthor: fallbackAdmin,
    avatarUrl: String(comment.profilePhotoUrl || ""),
    text: String(comment.text || ""),
    likes: Array.isArray(comment.likes) ? comment.likes.map((id) => String(id)) : [],
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt
  };
}

function buildThreadTree(comments) {
  const byId = new Map();
  const roots = [];

  comments.forEach((item) => {
    byId.set(item.id, { ...item, replies: [] });
  });

  comments.forEach((item) => {
    const node = byId.get(item.id);
    if (!node) return;

    if (item.parentCommentId && byId.has(item.parentCommentId)) {
      byId.get(item.parentCommentId).replies.push(node);
      return;
    }

    roots.push(node);
  });

  return roots;
}

exports.getEventComments = async (req, res) => {
  try {
    const eventId = String(req.params?.eventId || "").trim();
    if (!eventId) {
      return res.status(400).json({ message: "eventId is required." });
    }

    const comments = await EventComment.find({ eventId }).sort({ createdAt: 1 });
    const mapped = comments.map((item) => mapComment(item));
    res.json(buildThreadTree(mapped));
  } catch (error) {
    res.status(500).json({ message: "Failed to load comments." });
  }
};

exports.createComment = async (req, res) => {
  try {
    const eventId = String(req.body?.eventId || "").trim();
    const parentCommentIdRaw = String(req.body?.parentCommentId || "").trim();
    const parentCommentId = parentCommentIdRaw || null;
    const text = String(req.body?.text || "").trim();
    const studentId = getStudentId(req);

    if (!eventId) {
      return res.status(400).json({ message: "eventId is required." });
    }

    if (!text || text.length < 1) {
      return res.status(400).json({ message: "Comment text is required." });
    }

    if (text.length > 3000) {
      return res.status(400).json({ message: "Comment must be 3000 characters or less." });
    }

    if (parentCommentId) {
      const parent = await EventComment.findOne({ _id: parentCommentId, eventId }).select("_id");
      if (!parent) {
        return res.status(404).json({ message: "Parent comment not found." });
      }
    }

    const profile = await getUserProfile(studentId);

    const created = await EventComment.create({
      eventId,
      parentCommentId,
      studentId: profile.studentId,
      studentName: profile.studentName,
      authorRole: profile.role,
      authorUserCode: profile.authorUserCode,
      adminBadgeLabel: profile.adminBadgeLabel,
      profilePhotoUrl: profile.profilePhotoUrl,
      text
    });

    res.status(201).json(mapComment(created));
  } catch (error) {
    res.status(500).json({ message: "Failed to post comment." });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const commentId = String(req.params?.commentId || "").trim();
    const text = String(req.body?.text || "").trim();
    const studentId = getStudentId(req);

    if (!commentId) {
      return res.status(400).json({ message: "commentId is required." });
    }

    if (!text) {
      return res.status(400).json({ message: "Comment text is required." });
    }

    const comment = await EventComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found." });
    }

    if (String(comment.studentId) !== studentId) {
      return res.status(403).json({ message: "You can edit only your own comments." });
    }

    comment.text = text;
    await comment.save();

    res.json(mapComment(comment));
  } catch (error) {
    res.status(500).json({ message: "Failed to update comment." });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const commentId = String(req.params?.commentId || "").trim();
    const studentId = getStudentId(req);

    if (!commentId) {
      return res.status(400).json({ message: "commentId is required." });
    }

    const comment = await EventComment.findById(commentId).select("_id studentId eventId parentCommentId");
    if (!comment) {
      return res.status(404).json({ message: "Comment not found." });
    }

    if (String(comment.studentId) !== studentId) {
      return res.status(403).json({ message: "You can delete only your own comments." });
    }

    const parentCommentId = comment.parentCommentId ? String(comment.parentCommentId) : null;

    // Keep discussion intact: move direct children one level up, then delete only selected comment.
    await EventComment.updateMany(
      { eventId: String(comment.eventId), parentCommentId: String(comment._id) },
      { $set: { parentCommentId } }
    );
    await EventComment.deleteOne({ _id: comment._id });

    res.json({ message: "Comment deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete comment." });
  }
};

exports.toggleLike = async (req, res) => {
  try {
    const commentId = String(req.params?.commentId || "").trim();
    const studentId = getStudentId(req);

    if (!commentId) {
      return res.status(400).json({ message: "commentId is required." });
    }

    const comment = await EventComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found." });
    }

    const hasLiked = (comment.likes || []).includes(studentId);
    if (hasLiked) {
      comment.likes = (comment.likes || []).filter((id) => String(id) !== studentId);
    } else {
      comment.likes = [...(comment.likes || []), studentId];
    }

    await comment.save();
    res.json(mapComment(comment));
  } catch (error) {
    res.status(500).json({ message: "Failed to update like." });
  }
};

async function buildReplyNotificationsForUser(userId, limit = 20) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return [];
  }

  const ownedComments = await EventComment.find({ studentId: normalizedUserId })
    .select("_id eventId text")
    .lean();

  if (!ownedComments.length) {
    return [];
  }

  const parentById = new Map(ownedComments.map((comment) => [String(comment._id), comment]));
  const replies = await EventComment.find({
    parentCommentId: { $in: Array.from(parentById.keys()) },
    studentId: { $ne: normalizedUserId }
  })
    .sort({ createdAt: -1 })
    .limit(Math.max(limit * 3, 30))
    .lean();

  if (!replies.length) {
    return [];
  }

  const eventIds = Array.from(new Set(replies.map((reply) => String(reply.eventId || "")).filter(Boolean)));
  const events = await Event.find({ _id: { $in: eventIds } }).select("_id name").lean();
  const eventNameById = new Map(events.map((event) => [String(event._id), String(event.name || "Event")]));

  return replies.slice(0, limit).map((reply) => {
    const parent = parentById.get(String(reply.parentCommentId || ""));
    const actorName = String(reply.studentName || "Someone").trim() || "Someone";
    const actorRole = String(reply.authorRole || "").trim().toLowerCase();
    const isAdminAuthor = isAdminRole(actorRole) || /^admin\b/i.test(actorName);
    const eventName = eventNameById.get(String(reply.eventId || "")) || "an event";
    const parentSnippet = String(parent?.text || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 72);
    const preview = parentSnippet ? `"${parentSnippet}${parentSnippet.length >= 72 ? "..." : ""}"` : "your comment";

    return {
      id: `comment-reply-${reply._id}`,
      title: isAdminAuthor ? "Admin replied to your comment" : "New reply on your comment",
      message: `${actorName} replied to ${preview} on ${eventName}.`,
      tone: isAdminAuthor ? "success" : "info",
      createdAt: reply.createdAt,
      icon: isAdminAuthor ? "workspace_premium" : "reply",
      category: "comment",
      eventId: String(reply.eventId || ""),
      commentId: String(reply._id),
      parentCommentId: String(reply.parentCommentId || ""),
      actorName,
      actorRole,
      isAdminReply: isAdminAuthor
    };
  });
}

exports.getMyReplyNotifications = async (req, res) => {
  try {
    const userId = getStudentId(req);
    const notifications = await buildReplyNotificationsForUser(userId, 20);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Failed to load comment reply notifications." });
  }
};

exports.buildReplyNotificationsForUser = buildReplyNotificationsForUser;
