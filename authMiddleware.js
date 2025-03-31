// authMiddleware.js
const approvedAdminList = require('./approved_admin_list');
const bcrypt = require('bcryptjs');

const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Basic authentication required' 
      });
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    // Find admin in approved list
    const admin = approvedAdminList.find(admin => 
      admin.username === username && admin.isActive
    );

    if (!admin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid admin credentials' 
      });
    }

    // Compare passwords (use bcrypt.compare in production)
    // For now using simple comparison - replace with hashed passwords in production
    const passwordMatch = admin.password === password;
    // In production: const passwordMatch = await bcrypt.compare(password, admin.password);

    if (!passwordMatch) {
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid admin credentials' 
      });
    }

    // Attach admin info to request
    req.admin = {
      adminId: admin.adminId,
      username: admin.username,
      role: admin.role
    };

    next();
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
};

module.exports = { authenticateAdmin };