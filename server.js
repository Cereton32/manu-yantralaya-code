require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { syncAllToSheets } = require('./syncToSheets');
const Breakdown = require('./models/Breakdown');
const fs = require('fs')
const { authenticateAdmin } = require('./authMiddleware');

const app = express();
app.use(cors({
    origin: 'http://localhost', // Or your Flutter app's origin
    methods: ['POST', 'GET', 'PUT']
  }));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// File Upload Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + (file.originalname))
});
const upload = multer({ storage });

// Breakdown Schema




// Generate Breakdown ID
function generateId() {
  return 'BD-' + Date.now().toString(36).toUpperCase();
}

// API Endpoints
app.post('/api/breakdowns/open', upload.single('media'), async (req, res) => {
  try {
    const breakdown = new Breakdown({
      breakdownId: generateId(),
      userId: req.body.userId,
      openForm: {
        machineId: req.body.machineId,
        machineFamily: req.body.machineFamily,
        breakdownType:req.body.breakdownType,
        productionStopped: req.body.productionStopped === 'true',
        problemDescription: req.body.problemDescription,
        mediaUrl: req.file ? `/uploads/${req.file.filename}` : null
      }
    });
    
    await breakdown.save();
    await syncAllToSheets();
    res.json({ breakdownId: breakdown.breakdownId });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Add this near the top of your server file (after your other constants)
const APPROVED_MAINTENANCE_IDS = [
  'MNT-2023-001',
  'MNT-2023-002',
  'MNT-2023-003',
  // Add more approved maintenance IDs as needed
];

const APPROVED_CLOSURE_IDS = [
  'CLS-2023-001',
  'CLS-2023-002',
  'CLS-2023-003',
  // Add more approved closure IDs as needed
];

const APPROVED_APPROVAL_IDS = [
  'APPR-2023-001',
  'APPR-2023-002',
  'APPR-2023-003',
  // Add more approved approval IDs as needed
];

// approved_admin_list.js
const approvedAdminList = [
  {
    adminId: "ADMIN-001",
    username: "superadmin",
    password: "$2b$10$EXAMPLEHASHEDPASSWORD", // Hashed password in production
    fullName: "Super Admin",
    role: "superadmin",
    isActive: true
  },
  {
    adminId: "ADMIN-002",
    username: "maintenance_admin",
    password: "$2b$10$EXAMPLEHASHEDPASSWORD2",
    fullName: "Maintenance Admin",
    role: "maintenance",
    isActive: true
  }
  // Add more admins as needed
];
// Then modify your routes to include validation:
// In your main server file (e.g., server.js or app.js)

// Add these endpoints to your existing server.js file

// Admin-only endpoint to edit complete breakdown
// Add this endpoint for full breakdown deletion
app.delete('/api/admin/breakdowns/full/:id', authenticateAdmin, async (req, res) => {
  try {
    const breakdownId = req.params.id;
    const breakdown = await Breakdown.findOne({ breakdownId });
    
    if (!breakdown) {
      return res.status(404).json({
        success: false,
        error: "Breakdown not found"
      });
    }

    // Delete all associated media files
    const mediaFields = [
      breakdown.openForm?.mediaUrl,
      breakdown.closureForm?.mediaUrl
    ];

    mediaFields.forEach(url => {
      if (url) {
        const filePath = path.join(__dirname, url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    // Delete from database
    await Breakdown.deleteOne({ breakdownId });
    await syncAllToSheets();
    
    res.json({
      success: true,
      message: "Full breakdown deleted successfully"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Update the edit endpoint to handle all forms
// Admin Edit Endpoint with Partial Updates
app.put('/api/admin/breakdowns/full/:id', authenticateAdmin, async (req, res) => {
  try {
      const breakdownId = req.params.id;
      const updateData = {};
      
      // Open Form Fields
      if (req.body.machineId) updateData['openForm.machineId'] = req.body.machineId;
      if (req.body.machineFamily) updateData['openForm.machineFamily'] = req.body.machineFamily;
      if (req.body.problemDescription) updateData['openForm.problemDescription'] = req.body.problemDescription;
      if (req.body.productionStopped !== undefined) {
          updateData['openForm.productionStopped'] = req.body.productionStopped === 'true';
      }

      // Temporary Form Fields
      if (req.body.temporaryMaintenanceId) updateData['temporaryForm.maintenanceId'] = req.body.temporaryMaintenanceId;
      if (req.body.temporaryCorrectiveAction) updateData['temporaryForm.correctiveAction'] = req.body.temporaryCorrectiveAction;
      if (req.body.temporarySpareUsed) updateData['temporaryForm.spareUsed'] = req.body.temporarySpareUsed;

      // Closure Form Fields
      if (req.body.closureMaintenanceId) updateData['closureForm.maintenanceId'] = req.body.closureMaintenanceId;
      if (req.body.closureAnalysisReport) updateData['closureForm.analysisReport'] = req.body.closureAnalysisReport;

      // Approval Form Fields
      if (req.body.approvalId) updateData['approvalForm.approvalId'] = req.body.approvalId;
      if (req.body.approvalStatus) updateData['approvalForm.status'] = req.body.approvalStatus;

      // Update timestamps only for fields that are being updated
      if (req.body.temporaryMaintenanceId) updateData['timestamps.temporary'] = new Date();
      if (req.body.closureMaintenanceId) updateData['timestamps.closure'] = new Date();
      if (req.body.approvalId) updateData['timestamps.approval'] = new Date();

      const breakdown = await Breakdown.findOneAndUpdate(
          { breakdownId },
          { $set: updateData },
          { new: true }
      );

      if (!breakdown) {
          return res.status(404).json({
              success: false,
              error: "Breakdown not found"
          });
      }

      res.json({
          success: true,
          breakdown,
          message: "Breakdown updated successfully"
      });
  } catch (err) {
      res.status(500).json({
          success: false,
          error: err.message
      });
  }
});
// Admin verification endpoint
app.post('/api/admin/verify', authenticateAdmin, (req, res) => {
  try {
    const { adminId } = req.body;

    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID is required'
      });
    }

    const adminExists = approvedAdminList.some(
      admin => admin.adminId === adminId && admin.isActive
    );

    if (!adminExists) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found or inactive'
      });
    }

    res.json({
      success: true,
      message: 'Admin verification successful',
      admin: {
        adminId: req.admin.adminId,
        username: req.admin.username,
        role: req.admin.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Admin verification failed'
    });
  }
});

// Protected admin-only endpoint example
app.get('/api/admin/dashboard', authenticateAdmin, (req, res) => {
  res.json({
    success: true,
    message: `Welcome to admin dashboard, ${req.admin.username}`,
    adminInfo: req.admin
  });
});

app.put('/api/breakdowns/:id/temporary', async (req, res) => {
  try {
    // Validate maintenance ID
    if (!APPROVED_MAINTENANCE_IDS.includes(req.body.maintenanceId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid maintenance ID. Please use an approved ID."
      });
    }

    const breakdown = await Breakdown.findOneAndUpdate(
      { breakdownId: req.params.id, userId: req.body.userId },
      {
        'timestamps.temporary': new Date(),
        'temporaryForm': {
          maintenanceId: req.body.maintenanceId,
          correctiveAction: req.body.correctiveAction,
          spareUsed: req.body.spareUsed,
          isApproved: true // Mark as approved since we validated the ID
        }
      },
      { new: true }
    );
    
    if (!breakdown) {
      return res.status(403).json({
        success: false,
        error: "Not authorized or breakdown not found"
      });
    }
    
    await syncAllToSheets();
    res.json({
      success: true,
      breakdown,
      message: "Temporary report submitted successfully"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.put('/api/breakdowns/:id/closure', upload.single('media'), async (req, res) => {
  try {
    // Validate closure maintenance ID
    if (!APPROVED_CLOSURE_IDS.includes(req.body.maintenanceId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid closure maintenance ID. Please use an approved ID."
      });
    }

    const breakdown = await Breakdown.findOneAndUpdate(
      { 
        breakdownId: req.params.id, 
        userId: req.body.userId,
        'timestamps.temporary': { $exists: true }
      },
      {
        'timestamps.closure': new Date(),
        'closureForm': {
          maintenanceId: req.body.maintenanceId,
          analysisReport: req.body.analysisReport,
          mediaUrl: req.file ? `/uploads/${req.file.filename}` : null,
          isApproved: true // Mark as approved since we validated the ID
        }
      },
      { new: true }
    );
    
    if (!breakdown) {
      return res.status(403).json({
        success: false,
        error: "Not authorized or temporary report missing"
      });
    }
    
    await syncAllToSheets();
    res.json({
      success: true,
      breakdown,
      message: "Closure report submitted successfully"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.put('/api/breakdowns/:id/approval', async (req, res) => {
  try {
    // Validate approval ID
    if (!APPROVED_APPROVAL_IDS.includes(req.body.approvalId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid approval ID. Please use an approved ID."
      });
    }

    const breakdown = await Breakdown.findOneAndUpdate(
      { 
        breakdownId: req.params.id, 
        userId: req.body.userId,
        'timestamps.closure': { $exists: true }
      },
      {
        'timestamps.approval': new Date(),
        'approvalForm': {
          approvalId: req.body.approvalId,
          status: req.body.status,
          isApproved: true // Mark as approved since we validated the ID
        }
      },
      { new: true }
    );
    
    if (!breakdown) {
      return res.status(403).json({
        success: false,
        error: "Not authorized or closure report missing"
      });
    }
    
    await syncAllToSheets();
    res.json({
      success: true,
      breakdown,
      message: "Approval submitted successfully"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
app.get('/api/breakdowns/:userId', async (req, res) => {
  try {
    const breakdowns = await Breakdown.find({ userId: req.params.userId });
    res.json(breakdowns);
  } catch (err) {
    res.status(500).send(err.message);
  }
});
app.get('/api/breakdowns/single/:id', async (req, res) => {
    try {
      console.log(`Fetching breakdown: ${req.params.id}`);
      const breakdown = await Breakdown.findOne({ breakdownId: req.params.id });
      
      if (!breakdown) {
        return res.status(404).json({
          success: false,
          error: "Breakdown not found"
        });
      }
      
      res.json({ 
        success: true,
        breakdown 
      });
    } catch (err) {
      console.error('Error fetching breakdown:', err);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch breakdown' 
      });
    }
  });

  app.get('/api/files/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);
  
    // Check if file exists
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // Add to server.js
app.get('/api/breakdowns', authenticateAdmin, async (req, res) => {
  try {
    const breakdowns = await Breakdown.find();
    res.json(breakdowns);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));