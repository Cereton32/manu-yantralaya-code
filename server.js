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
    origin: 'http://localhost',
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

// Date Formatting Utility
function formatDate(date) {
  if (!date) return null;
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

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
        breakdownType: req.body.breakdownType,
        productionStopped: req.body.productionStopped === 'true',
        problemDescription: req.body.problemDescription,
        mediaUrl: req.file ? `/uploads/${req.file.filename}` : null
      },
      timestamps: {
        open: new Date()
      }
    });
    
    await breakdown.save();
    await syncAllToSheets();
    res.json({ 
      breakdownId: breakdown.breakdownId,
      createdAt: formatDate(breakdown.createdAt)
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const APPROVED_MAINTENANCE_IDS = [
  'MNT-2023-001',
  'MNT-2023-002',
  'MNT-2023-003',
];

const APPROVED_CLOSURE_IDS = [
  'CLS-2023-001',
  'CLS-2023-002',
  'CLS-2023-003',
];

const APPROVED_APPROVAL_IDS = [
  'APPR-2023-001',
  'APPR-2023-002',
  'APPR-2023-003',
];

const approvedAdminList = [
  {
    adminId: "ADMIN-001",
    username: "superadmin",
    password: "$2b$10$EXAMPLEHASHEDPASSWORD",
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
];

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

    await Breakdown.deleteOne({ breakdownId });
    await syncAllToSheets();
    
    res.json({
      success: true,
      message: "Full breakdown deleted successfully",
      deletedAt: formatDate(new Date())
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.put('/api/admin/breakdowns/full/:id', authenticateAdmin, async (req, res) => {
  try {
      const breakdownId = req.params.id;
      const updateData = {};
      
      if (req.body.machineId) updateData['openForm.machineId'] = req.body.machineId;
      if (req.body.machineFamily) updateData['openForm.machineFamily'] = req.body.machineFamily;
      if (req.body.problemDescription) updateData['openForm.problemDescription'] = req.body.problemDescription;
      if (req.body.productionStopped !== undefined) {
          updateData['openForm.productionStopped'] = req.body.productionStopped === 'true';
      }

      if (req.body.temporaryMaintenanceId) updateData['temporaryForm.maintenanceId'] = req.body.temporaryMaintenanceId;
      if (req.body.temporaryCorrectiveAction) updateData['temporaryForm.correctiveAction'] = req.body.temporaryCorrectiveAction;
      if (req.body.temporarySpareUsed) updateData['temporaryForm.spareUsed'] = req.body.temporarySpareUsed;

      if (req.body.closureMaintenanceId) updateData['closureForm.maintenanceId'] = req.body.closureMaintenanceId;
      if (req.body.closureAnalysisReport) updateData['closureForm.analysisReport'] = req.body.closureAnalysisReport;

      if (req.body.approvalId) updateData['approvalForm.approvalId'] = req.body.approvalId;
      if (req.body.approvalStatus) updateData['approvalForm.status'] = req.body.approvalStatus;

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

      const formattedBreakdown = {
        ...breakdown.toObject(),
        createdAt: formatDate(breakdown.createdAt),
        updatedAt: formatDate(breakdown.updatedAt),
        timestamps: {
          open: formatDate(breakdown.timestamps?.open),
          temporary: formatDate(breakdown.timestamps?.temporary),
          closure: formatDate(breakdown.timestamps?.closure),
          approval: formatDate(breakdown.timestamps?.approval)
        }
      };

      res.json({
          success: true,
          breakdown: formattedBreakdown,
          message: "Breakdown updated successfully"
      });
  } catch (err) {
      res.status(500).json({
          success: false,
          error: err.message
      });
  }
});

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
        role: req.admin.role,
        lastLogin: formatDate(new Date())
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Admin verification failed'
    });
  }
});

app.get('/api/admin/dashboard', authenticateAdmin, (req, res) => {
  res.json({
    success: true,
    message: `Welcome to admin dashboard, ${req.admin.username}`,
    adminInfo: req.admin,
    serverTime: formatDate(new Date())
  });
});

app.put('/api/breakdowns/:id/temporary', async (req, res) => {
  try {
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
          isApproved: true
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
    
    const formattedBreakdown = {
      ...breakdown.toObject(),
      createdAt: formatDate(breakdown.createdAt),
      updatedAt: formatDate(breakdown.updatedAt),
      timestamps: {
        open: formatDate(breakdown.timestamps?.open),
        temporary: formatDate(breakdown.timestamps?.temporary),
        closure: formatDate(breakdown.timestamps?.closure),
        approval: formatDate(breakdown.timestamps?.approval)
      }
    };
    
    res.json({
      success: true,
      breakdown: formattedBreakdown,
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
          isApproved: true
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
    
    const formattedBreakdown = {
      ...breakdown.toObject(),
      createdAt: formatDate(breakdown.createdAt),
      updatedAt: formatDate(breakdown.updatedAt),
      timestamps: {
        open: formatDate(breakdown.timestamps?.open),
        temporary: formatDate(breakdown.timestamps?.temporary),
        closure: formatDate(breakdown.timestamps?.closure),
        approval: formatDate(breakdown.timestamps?.approval)
      }
    };
    
    res.json({
      success: true,
      breakdown: formattedBreakdown,
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
          isApproved: true
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
    
    const formattedBreakdown = {
      ...breakdown.toObject(),
      createdAt: formatDate(breakdown.createdAt),
      updatedAt: formatDate(breakdown.updatedAt),
      timestamps: {
        open: formatDate(breakdown.timestamps?.open),
        temporary: formatDate(breakdown.timestamps?.temporary),
        closure: formatDate(breakdown.timestamps?.closure),
        approval: formatDate(breakdown.timestamps?.approval)
      }
    };
    
    res.json({
      success: true,
      breakdown: formattedBreakdown,
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
    
    const formattedBreakdowns = breakdowns.map(bd => ({
      ...bd.toObject(),
      createdAt: formatDate(bd.createdAt),
      updatedAt: formatDate(bd.updatedAt),
      timestamps: {
        open: formatDate(bd.timestamps?.open),
        temporary: formatDate(bd.timestamps?.temporary),
        closure: formatDate(bd.timestamps?.closure),
        approval: formatDate(bd.timestamps?.approval)
      }
    }));
    
    res.json(formattedBreakdowns);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/breakdowns/single/:id', async (req, res) => {
  try {
    const breakdown = await Breakdown.findOne({ breakdownId: req.params.id });
    
    if (!breakdown) {
      return res.status(404).json({
        success: false,
        error: "Breakdown not found"
      });
    }
    
    const formattedBreakdown = {
      ...breakdown.toObject(),
      createdAt: formatDate(breakdown.createdAt),
      updatedAt: formatDate(breakdown.updatedAt),
      timestamps: {
        open: formatDate(breakdown.timestamps?.open),
        temporary: formatDate(breakdown.timestamps?.temporary),
        closure: formatDate(breakdown.timestamps?.closure),
        approval: formatDate(breakdown.timestamps?.approval)
      }
    };
    
    res.json({ 
      success: true,
      breakdown: formattedBreakdown
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch breakdown' 
    });
  }
});

app.get('/api/files/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.get('/api/breakdowns', authenticateAdmin, async (req, res) => {
  try {
    const breakdowns = await Breakdown.find();
    
    const formattedBreakdowns = breakdowns.map(bd => ({
      ...bd.toObject(),
      createdAt: formatDate(bd.createdAt),
      updatedAt: formatDate(bd.updatedAt),
      timestamps: {
        open: formatDate(bd.timestamps?.open),
        temporary: formatDate(bd.timestamps?.temporary),
        closure: formatDate(bd.timestamps?.closure),
        approval: formatDate(bd.timestamps?.approval)
      }
    }));
    
    res.json(formattedBreakdowns);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} at ${formatDate(new Date())}`));