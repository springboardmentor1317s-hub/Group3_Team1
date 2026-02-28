# Database Connection Setup - Step by Step

## Current Status ✅
- MongoDB Connected - Working!
- Backend running on port 5000

---

## Step-by-Step: Database Kaise Connect Hota Hai

### Step 1: MongoDB Install Karein
MongoDB Community Server download karein:
https://www.mongodb.com/try/download/community

### Step 2: .env File Check Karein
Backend folder mein `.env` file banayi hai:
```
MONGO_URI=mongodb://127.0.0.1:27017/campus_event_hub
```

### Step 3: Connection Code (server.js)
```
javascript
require('dotenv').config();  // Load .env file
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.log('DB Error', err));
```

### Step 4: Backend Run Karein
```
bash
cd backend
node server.js
```

### Step 5: Verify Connection
Terminal mein "MongoDB Connected" message aana chahiye.

---

## Agar MongoDB Atlas Cloud Use Karna Hai:

1. MongoDB Atlas par account banayein
2. Free cluster create karein
3. Connection string copy karein:
   
```
   mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/campus_event_hub
   
```
4. .env file update karein:
   
```
   MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/campus_event_hub
   
```

---

## Current Working Setup:
- Database: MongoDB (Local)
- Connected: Yes ✅
- Status: Working ✅
