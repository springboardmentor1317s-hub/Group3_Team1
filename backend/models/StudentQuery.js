const mongoose = require("mongoose");

const studentQuerySchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  studentId: {
    type: String,
    required: true,
    index: true
  },
  studentEmail: {
    type: String,
    required: true
  },
  studentName: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["OPEN", "IN_PROGRESS", "RESOLVED"],
    default: "OPEN"
  },
  progressNote: {
    type: String,
    default: "Your query has been received and is waiting for review."
  },
  adminResponse: {
    type: String,
    default: ""
  },
  escalationRequested: {
    type: Boolean,
    default: false
  },
  escalatedAt: {
    type: Date,
    default: null
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

studentQuerySchema.index(
  { student: 1, deletedAt: 1, status: 1 },
  { partialFilterExpression: { deletedAt: null } }
);

module.exports = mongoose.model("StudentQuery", studentQuerySchema);
