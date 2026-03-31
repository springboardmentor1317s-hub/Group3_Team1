const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    role: {
      type: String,
      required: true,
      enum: ["student", "admin"],
      index: true
    },
    sourceKey: {
      type: String,
      required: true,
      trim: true
    },
    sourceType: {
      type: String,
      default: "system",
      trim: true
    },
    title: {
      type: String,
      default: "",
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    icon: {
      type: String,
      default: "notifications",
      trim: true
    },
    tone: {
      type: String,
      default: "info",
      trim: true
    },
    category: {
      type: String,
      default: "general",
      trim: true
    },
    isSeen: {
      type: Boolean,
      default: false,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  {
    versionKey: false
  }
);

notificationSchema.index({ userId: 1, role: 1, sourceKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, role: 1, isSeen: 1, deletedAt: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
