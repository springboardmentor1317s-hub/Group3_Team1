const StudentQuery = require("../models/StudentQuery");
const User = require("../models/User");

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
    subject: String(query.subject || ""),
    message: String(query.message || ""),
    status: String(query.status || "OPEN"),
    progressNote: String(query.progressNote || ""),
    adminResponse: String(query.adminResponse || ""),
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

    const student = await User.findById(studentObjectId).select("userId email name");
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const created = await StudentQuery.create({
      student: student._id,
      studentId: String(student.userId || ""),
      studentEmail: String(student.email || ""),
      studentName: String(student.name || "Student"),
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
