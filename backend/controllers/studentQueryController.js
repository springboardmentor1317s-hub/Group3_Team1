const StudentQuery = require("../models/StudentQuery");
const User = require("../models/User");

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isAdminRole(role) {
  const normalized = normalizeText(role);
  return normalized === "college_admin" || normalized === "admin";
}

function isStudentRole(role) {
  return normalizeText(role) === "student";
}

async function hasAdminAccess(userId, tokenRole) {
  if (isAdminRole(tokenRole)) {
    return true;
  }

  if (!userId) {
    return false;
  }

  const user = await User.findById(userId).select("role").lean();
  return isAdminRole(user?.role);
}

function serializeQuery(query) {
  if (!query) {
    return null;
  }

  const createdAt = new Date(query.createdAt);
  const ageInDays = Number.isNaN(createdAt.getTime())
    ? 0
    : Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    id: String(query._id),
    studentId: String(query.studentId || ""),
    studentEmail: String(query.studentEmail || ""),
    studentName: String(query.studentName || ""),
    studentCollege: String(query.studentCollege || ""),
    subject: String(query.subject || ""),
    message: String(query.message || ""),
    status: String(query.status || "OPEN"),
    progressNote: String(query.progressNote || ""),
    adminResponse: String(query.adminResponse || ""),
    adminResponseUpdatedAt: query.adminResponseUpdatedAt || null,
    adminRespondedBy: String(query.adminRespondedBy || ""),
    escalationRequested: Boolean(query.escalationRequested),
    escalatedAt: query.escalatedAt || null,
    canCreateAnother: query.status === "RESOLVED",
    canDelete: query.status !== "RESOLVED",
    canEscalate: query.status !== "RESOLVED" && ageInDays >= 7 && !query.escalationRequested,
    ageInDays,
    createdAt: query.createdAt,
    updatedAt: query.updatedAt
  };
}

async function findActiveQuery(studentObjectId) {
  return StudentQuery.findOne({
    student: studentObjectId,
    deletedAt: null,
    status: { $in: ["OPEN", "IN_PROGRESS"] }
  }).sort({ updatedAt: -1 });
}

exports.getMyQuery = async (req, res) => {
  try {
    const studentObjectId = req.user?.id;
    if (!isStudentRole(req.user?.role)) {
      return res.status(403).json({ message: "Only students can access this endpoint." });
    }
    if (!studentObjectId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const [activeQuery, latestResolved] = await Promise.all([
      findActiveQuery(studentObjectId),
      StudentQuery.findOne({
        student: studentObjectId,
        deletedAt: null,
        status: "RESOLVED"
      }).sort({ updatedAt: -1 })
    ]);

    res.json({
      activeQuery: serializeQuery(activeQuery),
      latestResolvedQuery: serializeQuery(latestResolved)
    });
  } catch (error) {
    console.error("Get student query error:", error);
    res.status(500).json({ message: "Failed to fetch student query" });
  }
};

exports.createQuery = async (req, res) => {
  try {
    const studentObjectId = req.user?.id;
    if (!isStudentRole(req.user?.role)) {
      return res.status(403).json({ message: "Only students can raise queries." });
    }
    if (!studentObjectId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const subject = String(req.body?.subject || "").trim();
    const message = String(req.body?.message || "").trim();

    if (subject.length < 3 || message.length < 10) {
      return res.status(400).json({ message: "Please enter a proper subject and query message." });
    }

    const existing = await findActiveQuery(studentObjectId);
    if (existing) {
      return res.status(400).json({
        message: "You already have one active query. Please wait until it is resolved or delete it first.",
        activeQuery: serializeQuery(existing)
      });
    }

    const student = await User.findById(studentObjectId).select("userId email name college");
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const created = await StudentQuery.create({
      student: student._id,
      studentId: String(student.userId || ""),
      studentEmail: String(student.email || ""),
      studentName: String(student.name || "Student"),
      studentCollege: String(student.college || ""),
      subject,
      message
    });

    res.status(201).json(serializeQuery(created));
  } catch (error) {
    console.error("Create student query error:", error);
    res.status(500).json({ message: "Failed to save your query" });
  }
};

exports.deleteQuery = async (req, res) => {
  try {
    const studentObjectId = req.user?.id;
    if (!isStudentRole(req.user?.role)) {
      return res.status(403).json({ message: "Only students can delete their queries." });
    }
    const queryId = String(req.params?.id || "").trim();
    if (!studentObjectId || !queryId) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const query = await StudentQuery.findOne({
      _id: queryId,
      student: studentObjectId,
      deletedAt: null
    });

    if (!query) {
      return res.status(404).json({ message: "Query not found" });
    }

    if (query.status === "RESOLVED") {
      return res.status(400).json({ message: "Resolved queries cannot be deleted." });
    }

    query.deletedAt = new Date();
    await query.save();

    res.json({ message: "Query deleted successfully" });
  } catch (error) {
    console.error("Delete student query error:", error);
    res.status(500).json({ message: "Failed to delete query" });
  }
};

exports.escalateQuery = async (req, res) => {
  try {
    const studentObjectId = req.user?.id;
    if (!isStudentRole(req.user?.role)) {
      return res.status(403).json({ message: "Only students can escalate their queries." });
    }
    const queryId = String(req.params?.id || "").trim();
    if (!studentObjectId || !queryId) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const query = await StudentQuery.findOne({
      _id: queryId,
      student: studentObjectId,
      deletedAt: null
    });

    if (!query) {
      return res.status(404).json({ message: "Query not found" });
    }

    if (query.status === "RESOLVED") {
      return res.status(400).json({ message: "Resolved queries cannot be escalated." });
    }

    const ageInDays = Math.max(
      0,
      Math.floor((Date.now() - new Date(query.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    );

    if (ageInDays < 7) {
      return res.status(400).json({ message: "You can request escalation only after 7 days." });
    }

    query.escalationRequested = true;
    query.escalatedAt = new Date();
    query.progressNote = "Escalation request recorded. This query is marked for higher attention.";
    await query.save();

    res.json(serializeQuery(query));
  } catch (error) {
    console.error("Escalate student query error:", error);
    res.status(500).json({ message: "Failed to escalate query" });
  }
};

async function resolveAdminCollegeScope(adminUserId) {
  const admin = await User.findById(adminUserId).select("college role name").lean();
  const college = String(admin?.college || "").trim();

  if (!admin || !isAdminRole(admin.role) || !college) {
    return { admin, college: "", studentIds: [] };
  }

  const students = await User.find({
    role: "student",
    college: { $regex: `^${college.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
  }).select("_id").lean();

  return {
    admin,
    college,
    studentIds: students.map((item) => item._id)
  };
}

exports.getCollegeQueries = async (req, res) => {
  try {
    const adminUserId = req.user?.id;
    const allowed = await hasAdminAccess(adminUserId, req.user?.role);
    if (!adminUserId || !allowed) {
      return res.status(403).json({ message: "Only college admins can access student queries." });
    }
    const { college } = await resolveAdminCollegeScope(adminUserId);
    const baseFilter = {
      deletedAt: null
    };

    if (college) {
      baseFilter.studentCollege = { $regex: `^${college.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
    }

    const queries = await StudentQuery.find(baseFilter).sort({ updatedAt: -1 });

    res.json(queries.map((item) => serializeQuery(item)));
  } catch (error) {
    console.error("Get college student queries error:", error);
    res.status(500).json({ message: "Failed to fetch student queries" });
  }
};

exports.replyCollegeQuery = async (req, res) => {
  try {
    const adminUserId = req.user?.id;
    const allowed = await hasAdminAccess(adminUserId, req.user?.role);
    if (!adminUserId || !allowed) {
      return res.status(403).json({ message: "Only college admins can reply to student queries." });
    }

    const queryId = String(req.params?.id || "").trim();
    const adminResponse = String(req.body?.adminResponse || "").trim();
    const status = String(req.body?.status || "").trim().toUpperCase();
    const progressNote = String(req.body?.progressNote || "").trim();

    if (!queryId) {
      return res.status(400).json({ message: "Query id is required." });
    }

    if (adminResponse.length < 3) {
      return res.status(400).json({ message: "Please enter a meaningful reply for the student." });
    }

    if (status && !["OPEN", "IN_PROGRESS", "RESOLVED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value." });
    }

    const admin = await User.findById(adminUserId).select("name role").lean();
    if (!admin || !isAdminRole(admin.role)) {
      return res.status(403).json({ message: "Only college admins can reply to student queries." });
    }

    const query = await StudentQuery.findOne({
      _id: queryId,
      deletedAt: null
    });

    if (!query) {
      return res.status(404).json({ message: "Query not found." });
    }

    query.adminResponse = adminResponse;
    query.adminResponseUpdatedAt = new Date();
    query.adminRespondedBy = String(admin?.name || "College Admin");
    query.progressNote = progressNote || (status === "RESOLVED"
      ? "Your query has been resolved by the college admin."
      : "College admin has replied. Please review the latest update.");

    if (status) {
      query.status = status;
    } else if (query.status === "OPEN") {
      query.status = "IN_PROGRESS";
    }

    await query.save();
    res.json(serializeQuery(query));
  } catch (error) {
    console.error("Reply college student query error:", error);
    res.status(500).json({ message: "Failed to save admin reply" });
  }
};
