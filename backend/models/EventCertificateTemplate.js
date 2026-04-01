const mongoose = require("mongoose");

const eventCertificateTemplateSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    organizationName: {
      type: String,
      default: "Campus Event Hub"
    },
    signerName: {
      type: String,
      default: ""
    },
    signerTitle: {
      type: String,
      default: ""
    },
    signatureDataUrl: {
      type: String,
      default: ""
    },
    uploadedBy: {
      type: String,
      default: ""
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("EventCertificateTemplate", eventCertificateTemplateSchema);
