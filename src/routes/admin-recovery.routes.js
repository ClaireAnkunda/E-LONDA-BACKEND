const express = require('express');
const adminRecoveryController = require('../controllers/admin-recovery.controller');

const router = express.Router();

// Admin Recovery (Public)
router
  .get('/instructions', adminRecoveryController.getRecoveryInstructions)
  .post('/recover', adminRecoveryController.recoverAdmin);

module.exports = router;









