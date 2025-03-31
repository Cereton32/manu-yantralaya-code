const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const Breakdown = require('./models/Breakdown');

async function syncAllToSheets() {
  try {
    // Create auth client
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Initialize the sheet
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID, serviceAccountAuth);
    
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const breakdowns = await Breakdown.find({});

    const rows = breakdowns.map(bd => ({
      'Breakdown ID': bd.breakdownId,
      'User ID': bd.userId,
      'Open Timestamp': bd.timestamps.open.toISOString(),
      'Machine ID': bd.openForm.machineId,
      'Machine Family': bd.openForm.machineFamily,
      'breakdownType': bd.openForm.breakdownType,
      'Production Stopped': bd.openForm.productionStopped ? 'Yes' : 'No',
      'Problem Description': bd.openForm.problemDescription,
      'Problem Media': bd.openForm.mediaUrl || '',
      'Temporary Timestamp': bd.timestamps.temporary?.toISOString() || '',
      'Maintenance ID (Temp)': bd.temporaryForm?.maintenanceId || '',
      'Corrective Action': bd.temporaryForm?.correctiveAction || '',
      'Spare Used': bd.temporaryForm?.spareUsed || '',
      'Closure Timestamp': bd.timestamps.closure?.toISOString() || '',
      'Maintenance ID (Closure)': bd.closureForm?.maintenanceId || '',
      'Analysis Report': bd.closureForm?.analysisReport || '',
      'Analysis Media': bd.closureForm?.mediaUrl || '',
      'Approval Timestamp': bd.timestamps.approval?.toISOString() || '',
      'Approval ID': bd.approvalForm?.approvalId || '',
      'Status': bd.approvalForm?.status || 'Pending'
    }));

    await sheet.clear();
    await sheet.setHeaderRow(Object.keys(rows[0]));
    await sheet.addRows(rows);

    console.log('✅ Synced', breakdowns.length, 'breakdowns to Google Sheets');
  } catch (err) {
    console.error('Sheets sync failed:', err.message);
  }
}

module.exports = { syncAllToSheets };