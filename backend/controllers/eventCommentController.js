const EventComment = require("../models/EventComment");
const User = require("../models/User");

const getStudentId = (req) => String(req.user?.id || req.user?._id || req.user?.userId || "");

async function getUserProfile(userId) {
  const user = await User.findById(userId).select("name userId profileImageUrl");
  if (!user) {
    return {
      studentId: userId,
      studentName: "Student",
      profilePhotoUrl: ""
    };
  }

  return {
    studentId: String(user._id),
    studentName: String(user.name || "Student"),
    profilePhotoUrl: String(user.profileImageUrl || "")
  };
}

function mapComment(comment) {
  return {
    id: String(comment._id),
    eventId: String(comment.eventId),
    parentCommentId: comment.parentCommentId ? String(comment.parentCommentId) : null,
    authorId: String(comment.studentId),
    name: String(comment.studentName || "Student"),
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
