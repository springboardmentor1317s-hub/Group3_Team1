const mongoose = require("mongoose");

const eventCertificateSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true
    },
    registrationId: {
      type: String,
      required: true
    },
    studentId: {
      type: String,
      required: true,
      index: true
    },
    attendanceId: {
      type: String,
      default: ""
    },
    certificateNumber: {
      type: String,
      required: true,
      default: ""
    },
    generatedBy: {
      type: String,
      default: ""
    },
    generatedAt: {
      type: Date,
      default: Date.now
    },
    lastDownloadedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

eventCertificateSchema.index({ eventId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("EventCertificate", eventCertificateSchema);
