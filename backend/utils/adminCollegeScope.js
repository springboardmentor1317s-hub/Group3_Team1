const User = require("../models/User");
const Event = require("../models/Event");

function normalizeValue(value) {
  return String(value || "").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildExactStringMatch(field, value) {
  const trimmed = normalizeValue(value);
  if (!trimmed) {
    return null;
  }

  return {
    [field]: { $regex: `^${escapeRegex(trimmed)}$`, $options: "i" }
  };
}

function buildLooseStringMatch(field, value) {
  const trimmed = normalizeValue(value);
  if (!trimmed) {
    return null;
  }

  return {
    [field]: { $regex: escapeRegex(trimmed), $options: "i" }
  };
}

async function getCollegeScopedUsers(userId) {
  const user = await User.findById(userId).select("name email userId college role").lean();
  const college = normalizeValue(user?.college);

  if (!user || !college) {
    return { user, college, users: [] };
  }

  const users = await User.find({
    college: { $regex: `^${escapeRegex(college)}$`, $options: "i" },
    role: { $in: ["college_admin", "admin"] }
  }).select("name email userId college role").lean();

  return { user, college, users };
}

function buildEventOwnerFilterFromUsers(users, college) {
  const identifierMatches = [];

  for (const user of users || []) {
    const candidates = Array.from(new Set([
      normalizeValue(user?._id),
      normalizeValue(user?.userId),
      normalizeValue(user?.email),
      normalizeValue(user?.name)
    ].filter(Boolean)));

    for (const candidate of candidates) {
      identifierMatches.push(
        buildExactStringMatch("createdById", candidate),
        buildExactStringMatch("ownerId", candidate),
        buildExactStringMatch("adminId", candidate),
        buildExactStringMatch("userId", candidate),
        buildExactStringMatch("email", candidate),
        buildExactStringMatch("createdBy", candidate)
      );
    }
  }

  const collegeMatches = [
    buildExactStringMatch("collegeName", college),
    buildLooseStringMatch("organizer", college),
    buildLooseStringMatch("createdBy", college)
  ];

  return {
    $or: [...identifierMatches, ...collegeMatches].filter(Boolean)
  };
}

async function getCollegeScopedEvents(userId) {
  const { college, users } = await getCollegeScopedUsers(userId);
  if (!college) {
    return [];
  }

  const filter = buildEventOwnerFilterFromUsers(users, college);
  return Event.find(filter).sort({ createdAt: -1 });
}

async function getCollegeScopedEventIds(userId) {
  const events = await getCollegeScopedEvents(userId);
  return events.map((event) => String(event._id));
}

module.exports = {
  normalizeValue,
  escapeRegex,
  buildExactStringMatch,
  buildLooseStringMatch,
  getCollegeScopedUsers,
  buildEventOwnerFilterFromUsers,
  getCollegeScopedEvents,
  getCollegeScopedEventIds
};
