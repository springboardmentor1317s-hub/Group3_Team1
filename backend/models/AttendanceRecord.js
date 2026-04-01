const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true
    },
    studentId: {
      type: String,
      required: true,
      index: true
    },
    registrationId: {
      type: String,
      required: true
    },
    markedBy: {
      type: String,
      default: ""
    },
    markedAt: {
      type: Date,
      default: Date.now
    },
    source: {
      type: String,
      enum: ["QR_SCAN", "MANUAL_ADMIN_MARK"],
      default: "QR_SCAN"
    }
  },
  { timestamps: true }
);

attendanceRecordSchema.index({ eventId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("AttendanceRecord", attendanceRecordSchema);
