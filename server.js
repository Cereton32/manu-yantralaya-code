require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { syncAllToSheets } = require('./syncToSheets');
const Breakdown = require('./models/Breakdown');
const fs = require('fs')

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
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
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

app.put('/api/breakdowns/:id/temporary', async (req, res) => {
  try {
    const breakdown = await Breakdown.findOneAndUpdate(
      { breakdownId: req.params.id, userId: req.body.userId },
      {
        'timestamps.temporary': new Date(),
        'temporaryForm': {
          maintenanceId: req.body.maintenanceId,
          correctiveAction: req.body.correctiveAction,
          spareUsed: req.body.spareUsed
        }
      },
      { new: true }
    );
    
    if (!breakdown) return res.status(403).send("Not authorized or breakdown not found");
    
    await syncAllToSheets();
    res.json(breakdown);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.put('/api/breakdowns/:id/closure', upload.single('media'), async (req, res) => {
  try {
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
          mediaUrl: req.file ? `/uploads/${req.file.filename}` : null
        }
      },
      { new: true }
    );
    
    if (!breakdown) return res.status(403).send("Not authorized or temporary report missing");
    
    await syncAllToSheets();
    res.json(breakdown);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.put('/api/breakdowns/:id/approval', async (req, res) => {
  try {
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
          status: req.body.status
        }
      },
      { new: true }
    );
    
    if (!breakdown) return res.status(403).send("Not authorized or closure report missing");
    
    await syncAllToSheets();
    res.json(breakdown);
  } catch (err) {
    res.status(500).send(err.message);
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));