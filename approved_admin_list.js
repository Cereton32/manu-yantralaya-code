// approved_admin_list.js
const approvedAdminList = [
    {
      adminId: "ADMIN-001",
      username: "superadmin",
      password: "admin123", // Plain text password for testing
      fullName: "Super Admin",
      role: "superadmin",
      isActive: true
    },
    {
      adminId: "ADMIN-002",
      username: "maintenance_admin",
      password: "maint456", // Plain text password for testing
      fullName: "Maintenance Admin",
      role: "maintenance",
      isActive: true
    }
  ];
  
  module.exports = approvedAdminList;