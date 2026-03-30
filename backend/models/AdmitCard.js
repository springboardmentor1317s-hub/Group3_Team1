const mongoose = require("mongoose");

const admitCardSchema = new mongoose.Schema(
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
    tokenHash: {
      type: String,
      required: true
    },
    cardCode: {
      type: String,
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

admitCardSchema.index({ eventId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("AdmitCard", admitCardSchema);
