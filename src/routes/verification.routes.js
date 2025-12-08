// Import the Express framework
const express = require('express');

// Create a new router object from Express. This will handle defining routes.
const router = express.Router();

// Import the controller module that contains the actual logic for verification tasks
const verificationController = require('../controllers/verification.controller');

// --- Public Routes for OTP Verification ---
// These routes do not require any prior user authentication.

// POST route to handle requesting a one-time password (OTP).
// This is typically the first step (e.g., sending OTP to email/phone number).
router.post('/request-otp', verificationController.requestOTP);

// POST route to handle confirming or validating the received OTP.
// The user sends the received code here for verification.
router.post('/confirm', verificationController.confirmOTP);

// Export the router so it can be mounted and used by the main Express application
module.exports = router;
