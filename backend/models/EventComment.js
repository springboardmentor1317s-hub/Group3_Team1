const mongoose = require("mongoose");

const eventCommentSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      trim: true
    },
    parentCommentId: {
      type: String,
      default: null,
      trim: true
    },
    studentId: {
      type: String,
      required: true,
      trim: true
    },
    studentName: {
      type: String,
      required: true,
      trim: true
    },
    profilePhotoUrl: {
      type: String,
      default: "",
      trim: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000
    },
    likes: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

eventCommentSchema.index({ eventId: 1, createdAt: -1 });
eventCommentSchema.index({ eventId: 1, parentCommentId: 1, createdAt: 1 });

module.exports = mongoose.model("EventComment", eventCommentSchema);
