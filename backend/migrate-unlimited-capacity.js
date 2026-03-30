require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('./models/Event');

const candidateUris = Array.from(
  new Set(
    [
      process.env.MONGO_URI,
      'mongodb://127.0.0.1:27017/campus-event-hub',
      'mongodb://127.0.0.1:27017/CompushEventHub'
    ].filter(Boolean)
  )
);

async function connectFirstAvailable() {
  let lastError = null;

  for (const uri of candidateUris) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000
      });
      console.log(`Connected to ${uri}`);
      return uri;
    } catch (error) {
      lastError = error;
      try {
        await mongoose.disconnect();
      } catch {}
    }
  }

  throw lastError || new Error('Could not connect to MongoDB.');
}

async function runMigration() {
  await connectFirstAvailable();

  const legacyFilter = {
    maxAttendees: 100,
    registrations: { $in: [0, null] },
    participants: { $in: [0, null] },
    $or: [
      { attendeeIds: { $exists: false } },
      { attendeeIds: { $size: 0 } }
    ]
  };

  const matchingEvents = await Event.find(legacyFilter).select('name collegeName maxAttendees registrations participants createdAt').lean();

  if (!matchingEvents.length) {
    console.log('No legacy unlimited-capacity events needed migration.');
    return;
  }

  console.log(`Found ${matchingEvents.length} legacy events to normalize.`);
  matchingEvents.forEach((event) => {
    console.log(`- ${event.name} | ${event.collegeName || 'Unknown college'} | ${event.createdAt || 'Unknown date'}`);
  });

  const result = await Event.updateMany(legacyFilter, {
    $set: { maxAttendees: null }
  });

  console.log(`Updated ${result.modifiedCount || 0} events to unlimited capacity.`);
}

runMigration()
  .catch((error) => {
    console.error('Unlimited-capacity migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
  });
