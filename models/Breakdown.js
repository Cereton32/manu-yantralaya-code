const mongoose = require('mongoose');

const BreakdownSchema = new mongoose.Schema({
  breakdownId: { type: String, unique: true },
  userId: { type: String, required: true },
  timestamps: {
    open: { type: Date, default: Date.now },
    temporary: Date,
    closure: Date,
    approval: Date
  },
  openForm: {
    machineId: String,
    machineFamily: String,
    productionStopped: Boolean,
    problemDescription: String,
    BreakdownType:String,
    mediaUrl: String
  },
  temporaryForm: {
    maintenanceId: String,
    correctiveAction: String,
    spareUsed: String
  },
  closureForm: {
    maintenanceId: String,
    analysisReport: String,
    mediaUrl: String
  },
  approvalForm: {
    approvalId: String,
    status: { type: String, enum: ['Approved', 'Rejected', 'Pending'] }
  }
});

module.exports = mongoose.models.Breakdown || mongoose.model('Breakdown', BreakdownSchema);