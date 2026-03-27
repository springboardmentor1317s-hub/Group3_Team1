const express = require("express");
const protect = require("../middleware/authMiddleware");
const controller = require("../controllers/studentQueryController");

const router = express.Router();

router.get("/me", protect, controller.getMyQuery);
router.post("/", protect, controller.createQuery);
router.delete("/:id", protect, controller.deleteQuery);
router.post("/:id/escalate", protect, controller.escalateQuery);

module.exports = router;
