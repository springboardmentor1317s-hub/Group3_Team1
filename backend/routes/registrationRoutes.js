const express = require('express');
const router = express.Router();

const registrationController = require('../controllers/registrationController');


// Student register
router.post('/', registrationController.createRegistration);


// Admin dashboard
router.get('/', registrationController.getAllRegistrations);


// Student dashboard
router.get('/student/:studentId', registrationController.getStudentRegistrations);

// Student cancel registration
router.delete('/student/:studentId/event/:eventId', registrationController.cancelRegistration);


// Admin approve
router.patch('/:id/approve', registrationController.approveRegistration);


// Admin reject
router.patch('/:id/reject', registrationController.rejectRegistration);


module.exports = router;
