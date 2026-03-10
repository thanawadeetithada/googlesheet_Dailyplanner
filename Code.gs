const SPREADSHEET_ID = '1uQcmWUAnN2JMELJMFZq8_h3Ux5arvVGFjgKHM_YBnYw';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Daily Planner UI')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- ฟังก์ชันจัดการข้อมูลในชีต Goal ---

// เพิ่มฟังก์ชันนี้ลงใน Code.gs
function getInitialData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. ดึงข้อมูลจากชีต Goal
  const goalSheet = ss.getSheetByName('Goal');
  const goalRows = goalSheet.getDataRange().getValues();
  // แปลง Array จาก Sheet เป็น Object ที่ React เข้าใจ (ข้ามแถวแรกที่เป็นหัวข้อ)
  const goals = goalRows.slice(1).map(row => ({
    id: row[0],
    text: row[1],
    completed: row[2] === 'complete'
  }));

  // 2. คืนค่าข้อมูลเริ่มต้นทั้งหมด (สามารถเพิ่ม Finance หรือ Todos ได้ที่นี่ในอนาคต)
  return {
    goals: goals,
    finances: { targetItems: [] }, 
    water: 0, 
    workTime: { in: '', out: '', breaks: [] },
    routines: [], 
    todos: [], 
    routineHistory: {}, 
    moodHistory: {}, 
    workHistory: {}, 
    transactions: []
  };
}

// 1. บันทึกเป้าหมายใหม่ลง Sheet
function saveGoalToSheet(goalObj) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Goal');
  if (!sheet) sheet = ss.insertSheet('Goal'); // สร้างชีตถ้ายังไม่มี
  
  // โครงสร้าง: ID_GOAL | Goal | Status_goal
  sheet.appendRow([
    goalObj.id,
    goalObj.text,
    goalObj.completed ? 'complete' : 'pending'
  ]);
  return true;
}

// 2. อัปเดตสถานะ (จาก pending เป็น complete หรือสลับไปมา)
function updateGoalStatusInSheet(goalId, isCompleted) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Goal');
  const data = sheet.getDataRange().getValues();
  const statusText = isCompleted ? 'complete' : 'pending';
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === goalId.toString()) {
      sheet.getRange(i + 1, 3).setValue(statusText);
      break;
    }
  }
}

// 3. ลบแถวข้อมูลตาม ID
function deleteGoalFromSheet(goalId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Goal');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === goalId.toString()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}