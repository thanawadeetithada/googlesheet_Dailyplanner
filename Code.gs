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

// นำโค้ดชุดนี้ไปแก้ไขแทนที่ฟังก์ชัน getInitialData() ตัวเดิมใน Code.gs
function getInitialData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. ดึง Goal
  let goals = [];
  const goalSheet = ss.getSheetByName('Goal');
  if (goalSheet) {
    const goalRows = goalSheet.getDataRange().getValues();
    if (goalRows.length > 1) {
      goals = goalRows.slice(1).map(row => ({
        id: row[0],
        text: row[1],
        completed: row[2] === 'complete'
      }));
    }
  }

  // 2. ดึง ToDos
  let todos = [];
  let routines = [];
  const todoSheet = ss.getSheetByName('ToDos');
  if (todoSheet) {
    const todoRows = todoSheet.getDataRange().getValues();
    if (todoRows.length > 1) {
      todoRows.slice(1).forEach(row => {
        let dateStr = '';
        if (row[2]) {
          if (row[2] instanceof Date) {
            const d = new Date(row[2]);
            dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          } else {
            dateStr = String(row[2]);
          }
        }
        const item = {
          id: row[0],
          text: row[1],
          date: dateStr,
          start: row[3] ? convertTimeObjToStr(row[3]) : '', 
          end: row[4] ? convertTimeObjToStr(row[4]) : '',
          completed: row[5] === 'complete'
        };
        if (item.date !== '') todos.push(item);
        else routines.push(item);
      });
    }
  }

  // 3. ดึง Finance (เป้าหมายการเงิน)
  let targetItems = [];
  const finSheet = ss.getSheetByName('Finance');
  if (finSheet) {
    const finRows = finSheet.getDataRange().getValues();
    if (finRows.length > 1) {
      finRows.slice(1).forEach(row => {
        // คัดกรองเอาเฉพาะ Category ที่เป็น 'FinancialTargets' มาแสดงตรงนี้
        if (row[3] === 'FinancialTargets') {
          targetItems.push({
            id: row[0],
            text: row[2],
            amount: Number(row[4])
          });
        }
      });
    }
  }

  return {
    goals: goals,
    finances: { targetItems: targetItems }, // นำเป้าหมายการเงินส่งกลับไปที่หน้าเว็บ
    water: 0, 
    workTime: { in: '', out: '', breaks: [] },
    routines: routines, 
    todos: todos, 
    routineHistory: {}, 
    moodHistory: {}, 
    workHistory: {}, 
    transactions: []
  };
}

function convertTimeObjToStr(timeVal) {
  if (timeVal instanceof Date) {
    const h = String(timeVal.getHours()).padStart(2, '0');
    const m = String(timeVal.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return String(timeVal);
}

// ฟังก์ชันช่วยเหลือสำหรับแปลงเวลาจาก Google Sheet ให้เป็น String hh:mm
function convertTimeObjToStr(timeVal) {
  if (timeVal instanceof Date) {
    const h = String(timeVal.getHours()).padStart(2, '0');
    const m = String(timeVal.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return String(timeVal);
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

// --- ฟังก์ชันจัดการข้อมูลในชีต ToDos ---

// 1. บันทึก To-Do หรือ Schedule ใหม่ลง Sheet
function saveTodoToSheet(todoObj) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ToDos');
  if (!sheet) sheet = ss.insertSheet('ToDos'); // สร้างชีตถ้ายังไม่มี
  
  // โครงสร้างชีต: ID_Todos | Text | Date | Start | End | Status_Todos
  sheet.appendRow([
    todoObj.id,
    todoObj.text,
    todoObj.date || '',   // ถ้าเป็น Schedule จะส่งค่าว่างมา
    todoObj.start || '',
    todoObj.end || '',
    todoObj.completed ? 'complete' : 'pending' // ค่าเริ่มต้นคือ pending
  ]);
  return true;
}

// 2. ลบแถวข้อมูลตาม ID (ใช้ลบได้ทั้ง To-Do และ Schedule)
function deleteTodoFromSheet(todoId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('ToDos');
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === todoId.toString()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

// --- ฟังก์ชันจัดการข้อมูลในชีต Finance ---

// บันทึกข้อมูลการเงิน (เป้าหมาย, รายรับ, รายจ่าย)
function saveFinanceToSheet(finObj) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Finance');
  if (!sheet) sheet = ss.insertSheet('Finance'); 
  
  // โครงสร้างชีต: ID_Fin | Date | Text | Category | Amount | Status_Fin
  sheet.appendRow([
    finObj.id,
    finObj.date,
    finObj.text,
    finObj.category, // จะเป็น FinancialTargets สำหรับเป้าหมายการเงิน
    finObj.amount,
    finObj.status || 'pending'
  ]);
  return true;
}

// ลบแถวข้อมูลตาม ID
function deleteFinanceFromSheet(finId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Finance');
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === finId.toString()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}