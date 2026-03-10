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

// ==========================================
// ส่วนที่ 1: ดึงข้อมูลตอนเปิดแอป (Read Data)
// ==========================================
function getInitialData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 1. ดึง Goal
  let goals = [];
  const goalSheet = ss.getSheetByName('Goal');
  if (goalSheet) {
    const goalRows = goalSheet.getDataRange().getValues();
    if (goalRows.length > 1) {
      goals = goalRows.slice(1).map(row => ({
        id: row[0], text: row[1], completed: row[2] === 'complete'
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
          id: row[0], text: row[1], date: dateStr,
          type: row[3] || (dateStr ? 'To-Do' : 'Schedule'), 
          start: row[4] ? convertTimeObjToStr(row[4]) : '', 
          end: row[5] ? convertTimeObjToStr(row[5]) : '',
          completed: row[6] === 'complete' // เช็กจากคอลัมน์ G
        };
        
        if (item.type === 'To-Do') todos.push(item);
        else routines.push(item);
      });
    }
  }

  // 3. ดึง Finance 
  let targetItems = [];
  let transactions = [];
  const finSheet = ss.getSheetByName('Finance');
  if (finSheet) {
    const finRows = finSheet.getDataRange().getDisplayValues(); 
    if (finRows.length > 1) {
      finRows.slice(1).forEach(row => {
        const typeCategory = String(row[3]).trim(); 
        if (typeCategory === 'FinancialTargets') {
          targetItems.push({ id: row[0], text: row[2], amount: Number(String(row[4]).replace(/,/g, '')) });
        } 
        else if (typeCategory === 'income' || typeCategory === 'expense') {
          let dateForReact = '';
          const dateParts = String(row[1]).trim().split('/');
          if(dateParts.length === 3) {
             dateForReact = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`; 
          } else {
             dateForReact = String(row[1]).trim();
          }
          transactions.push({ id: row[0], date: dateForReact, text: row[2], category: row[2], type: typeCategory, amount: Number(String(row[4]).replace(/,/g, '')), status: row[5] });
        }
      });
    }
  }

  // 4. ดึง DailyLogs 
  const d = new Date();
  const todayDDMMYYYY = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  let dailyLog = { id: 'dl' + Date.now(), date: todayDDMMYYYY, water: 0, workIn: '', workOut: '', breaks: [], mood: '', completedIds: [] };

  const dailySheet = ss.getSheetByName('DailyLogs');
  if (dailySheet) {
    const dailyRows = dailySheet.getDataRange().getDisplayValues();
    for (let i = dailyRows.length - 1; i >= 1; i--) {
      if (dailyRows[i][1] === todayDDMMYYYY) {
        dailyLog = {
          id: dailyRows[i][0] || 'dl' + Date.now(),
          date: todayDDMMYYYY,
          water: parseInt(dailyRows[i][2]) || 0,
          workIn: dailyRows[i][3] || '',
          workOut: dailyRows[i][4] || '',
          breaks: dailyRows[i][5] ? JSON.parse(dailyRows[i][5]) : [],
          mood: dailyRows[i][6] || '',
          completedIds: dailyRows[i][7] ? JSON.parse(dailyRows[i][7]) : []
        };
        break;
      }
    }
  }

  return {
    goals: goals, finances: { targetItems: targetItems }, water: 0, workTime: { in: '', out: '', breaks: [] },
    routines: routines, todos: todos, routineHistory: {}, moodHistory: {}, workHistory: {}, transactions: transactions, dailyLog: dailyLog
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

// ==========================================
// 2: บันทึก อัปเดต ลบ ข้อมูล (Write Data)
// ==========================================

// --- Goal ---
function saveGoalToSheet(goalObj) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Goal');
  if (!sheet) sheet = ss.insertSheet('Goal');
  sheet.appendRow([goalObj.id, goalObj.text, goalObj.completed ? 'complete' : 'pending']);
  return true;
}

function updateGoalStatusInSheet(goalId, isCompleted) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Goal');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === goalId.toString()) {
      sheet.getRange(i + 1, 3).setValue(isCompleted ? 'complete' : 'pending');
      break;
    }
  }
}

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

// --- ToDos ---
function saveTodoToSheet(todoObj) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ToDos');
  if (!sheet) sheet = ss.insertSheet('ToDos');
  
  sheet.appendRow([
    todoObj.id, 
    todoObj.text, 
    todoObj.date || '', 
    todoObj.type || 'To-Do',
    todoObj.start || '', 
    todoObj.end || '', 
    todoObj.completed ? 'complete' : 'pending',
    JSON.stringify([]) 
  ]);
  return true;
}

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

// 🌟🌟 ฟังก์ชันเจ้าปัญหาที่แก้ให้แล้วแบบ 1,000,000% 🌟🌟
function updateTodoStatusInSheet(todoId, type, dateStr) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('ToDos');
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0]; // อ่านหัวตาราง
  
  // ค้นหาตำแหน่งคอลัมน์จากชื่อเลย จะได้ไม่ผิดช่องอีก
  let statusCol = headers.findIndex(h => h.toString().trim() === 'Status_Todos') + 1;
  let dateCol = headers.findIndex(h => h.toString().trim() === 'Complete_Date_Schedule') + 1;
  
  // สำรองเผื่อพิมพ์ชื่อหัวตารางผิดหรือมีวรรค
  if (statusCol === 0) statusCol = 7; 
  if (dateCol === 0) dateCol = 8;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === todoId.toString()) {
      
      // ✅ 1. เปลี่ยน Pending -> Complete สำหรับ To-Do
      if (type === 'To-Do' || type === 'todos') {
        sheet.getRange(i + 1, statusCol).setValue('complete'); 
      } 
      
      // ✅ 2. ใส่วันที่ลง Complete_Date_Schedule สำหรับทั้ง To-Do และ Schedule
      if (type === 'To-Do' || type === 'Schedule' || type === 'todos' || type === 'routines') {
        let currentDates = [];
        try { 
          const cellVal = data[i][dateCol - 1];
          currentDates = cellVal ? JSON.parse(cellVal) : []; 
        } catch(e) { 
          currentDates = []; 
        }
        
        let displayDate = dateStr;
        if(dateStr && dateStr.includes('-')) {
           const parts = dateStr.split('-');
           displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`; // ทำเป็น วว/ดด/ปปปป
        }

        if (!currentDates.includes(displayDate)) {
          currentDates.push(displayDate);
          sheet.getRange(i + 1, dateCol).setValue(JSON.stringify(currentDates));
        }
      }
      
      break;
    }
  }
}

// --- Finance ---
function saveFinanceTxToSheet(txObj) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Finance');
  if (!sheet) sheet = ss.insertSheet('Finance'); 
  const dateParts = txObj.date.split('-');
  let sheetDate = txObj.date;
  if (dateParts.length === 3) sheetDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`; 
  sheet.appendRow([txObj.id, sheetDate, txObj.category, txObj.type, txObj.amount, 'complete']);
  return true;
}

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

// --- DailyLogs ---
function saveDailyLogToSheet(logObj) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('DailyLogs');
  if (!sheet) sheet = ss.insertSheet('DailyLogs');

  const data = sheet.getDataRange().getDisplayValues();
  let rowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === logObj.date) {
      rowIndex = i + 1;
      break;
    }
  }

  const rowData = [
    logObj.id, logObj.date, logObj.water || 0, logObj.workIn || '', logObj.workOut || '',
    JSON.stringify(logObj.breaks || []), logObj.mood || '', JSON.stringify(logObj.completedIds || []) 
  ];

  if (rowIndex > -1) sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  else sheet.appendRow(rowData);
  return true;
}