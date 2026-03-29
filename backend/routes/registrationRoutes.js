const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');

const registrationController = require('../controllers/registrationController');


// Student register
router.post('/', protect, registrationController.createRegistration);


// Admin dashboard
router.get('/', registrationController.getAllRegistrations);
router.get('/college', protect, registrationController.getCollegeRegistrations);
router.get('/college/:id/review', protect, registrationController.getCollegeRegistrationReview);


// Student dashboard
router.get('/student/:studentId', protect, registrationController.getStudentRegistrations);

// Student cancel registration
router.delete('/student/:studentId/event/:eventId', protect, registrationController.cancelRegistration);


// Admin approve
router.patch('/:id/approve', protect, registrationController.approveRegistration);


// Admin reject
router.patch('/:id/reject', protect, registrationController.rejectRegistration);


module.exports = router;
