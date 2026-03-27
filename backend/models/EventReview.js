const mongoose = require("mongoose");

const eventReviewSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      trim: true
    },
    studentId: {
      type: String,
      required: true,
      trim: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    feedback: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    }
  },
  { timestamps: true }
);

eventReviewSchema.index({ eventId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("EventReview", eventReviewSchema);

