# Step-by-Step Fix for Admin Record (to enable dashboard/events)

## 1. Open MongoDB Shell
**New VSCode Terminal:**
```
cd backend
mongosh "mongodb://127.0.0.1:27017/campus-event-hub"
```

## 2. Run these MongoDB commands:
```
db.users.find({userId: \"Rohit\"})
```
```
db.colleges.insertOne({
  name: \"IIT Bansal\", 
  shortName: \"IITB\", 
  location: \"Bhopal\", 
  isActive: true
})
```
**Copy the new `collegeId` from output**

```
db.admins.insertOne({
  userId: ObjectId(\"69bb1c94f4b100e113e8c77d\"),
  collegeId: ObjectId(\"PASTE_YOUR_COLLEGE_ID_HERE\"),
  permissions: [\"events\",\"registrations\",\"analytics\",\"students\"],
  isActive: true
})
```

## 3. Verify:
```
db.admins.find({userId: ObjectId(\"69bb1c94f4b100e113e8c77d\")})
```

## 4. Exit & Test:
```
exit
```

**Refresh http://localhost:4200 → Login → Events/dashboard now work!**

**Backend logs will show no more "Admin not found".**
