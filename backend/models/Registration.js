// const mongoose = require('mongoose');

// const registrationSchema = new mongoose.Schema({

//   eventId: String,

//   eventName: String,

//   studentId: String,

//   studentName: String,

//   email: String,

//   college: String,

//   status: {
//     type: String,
//     enum: ['PENDING','APPROVED','REJECTED'],
//     default: 'PENDING'
//   },

//   rejectionReason: {
//     type: String,
//     default: ''
//   }

// }, { timestamps: true });

// module.exports = mongoose.model('Registration', registrationSchema);

const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true
  },
  eventName: {
    type: String,
    required: true
  },
  studentId: {
    type: String,
    required: true
  },
  studentName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  college: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  approvedAt: {
    type: Date
  },
  rejectedAt: {
    type: Date
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add compound index to prevent duplicate registrations
registrationSchema.index({ eventId: 1, studentId: 1 }, { unique: true });

// Virtual property to expose _id as id
registrationSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Ensure id is included when converting to JSON
registrationSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id.toString();
    return ret;
  }
});

module.exports = mongoose.model('Registration', registrationSchema);