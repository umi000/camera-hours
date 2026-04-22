const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

/** Collapse whitespace, strip zero-width chars, lowercase — stable join key for store + user */
function normalizeKeyPart(s) {
  return String(s ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Resolve path to logs/json/db/<Client>.json (same rules as POST /compare-data).
 * @returns {string|null}
 */
function resolveDbJsonPath(dbDir, clientName) {
  if (!fs.existsSync(dbDir)) return null;
  const sanitizedClientName1 = clientName.replace(/[^a-zA-Z0-9]/g, '');
  const sanitizedClientName2 = clientName.replace(/[^a-zA-Z0-9]/g, '_');
  let dbFilePath = path.join(dbDir, `${sanitizedClientName1}.json`);
  if (fs.existsSync(dbFilePath)) return dbFilePath;
  dbFilePath = path.join(dbDir, `${sanitizedClientName2}.json`);
  if (fs.existsSync(dbFilePath)) return dbFilePath;
  let names;
  try {
    names = fs.readdirSync(dbDir).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  for (const name of names) {
    const fp = path.join(dbDir, name);
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const clientNameInFile = data.clientName || '';
      if (
        clientNameInFile.toLowerCase() === clientName.toLowerCase() ||
        clientNameInFile.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === sanitizedClientName1.toLowerCase()
      ) {
        return fp;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

/**
 * Portal exports newest first; prefer filename prefix ClientSanitized- and optional clientId match.
 */
function listPortalCandidates(portalDir, clientName, clientId) {
  if (!fs.existsSync(portalDir)) return [];
  const sanitized1 = clientName.replace(/[^a-zA-Z0-9]/g, '');
  const prefix = `${sanitized1.toLowerCase()}-`;
  const names = fs.readdirSync(portalDir).filter((file) => file.endsWith('.json'));
  const allPortalFiles = names.map((file) => {
    const full = path.join(portalDir, file);
    return {
      name: file,
      path: full,
      time: fs.statSync(full).mtime.getTime(),
      data: JSON.parse(fs.readFileSync(full, 'utf8'))
    };
  });

  let portalFiles = allPortalFiles.filter((file) => file.name.toLowerCase().startsWith(prefix));
  if (portalFiles.length === 0) {
    const sanitized2 = clientName.replace(/[^a-zA-Z0-9]/g, '_');
    const stripped = clientName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    portalFiles = allPortalFiles.filter((file) => {
      const fileNameLower = file.name.toLowerCase();
      return (
        fileNameLower.includes(sanitized1.toLowerCase()) ||
        fileNameLower.includes(sanitized2.toLowerCase()) ||
        (stripped && fileNameLower.includes(stripped))
      );
    });
  }
  if (portalFiles.length === 0) {
    portalFiles = allPortalFiles.filter((file) => {
      const clientNameInFile = (file.data.clientName || '').toLowerCase();
      return (
        clientNameInFile === clientName.toLowerCase() ||
        clientNameInFile.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === sanitized1.toLowerCase()
      );
    });
  }
  if (clientId != null && String(clientId) !== '') {
    const byId = portalFiles.filter((f) => String(f.data.clientId ?? '') === String(clientId));
    if (byId.length > 0) portalFiles = byId;
  }
  portalFiles.sort((a, b) => b.time - a.time);
  return portalFiles;
}

function compareDBAndPortal(dbData, portalData, clientId, clientName) {
  try {
    const parseNum = (v) => {
      const n = parseFloat(String(v ?? '').replace(/[%\s,]/g, ''));
      return Number.isFinite(n) ? n : 0;
    };

    const pickField = (record, ...candidates) => {
      if (!record || typeof record !== 'object') return undefined;
      for (const name of candidates) {
        if (record[name] !== undefined && record[name] !== null && record[name] !== '') {
          return record[name];
        }
      }
      const lowerKeys = {};
      for (const k of Object.keys(record)) {
        lowerKeys[k.toLowerCase()] = record[k];
      }
      for (const name of candidates) {
        const v = lowerKeys[String(name).toLowerCase()];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    };

    let dbRecords = Array.isArray(dbData) ? dbData : (dbData.data || []);
    if (!Array.isArray(dbRecords)) {
      dbRecords = [];
    }
    let portalRecords = Array.isArray(portalData) ? portalData : (portalData.data || []);
    if (!Array.isArray(portalRecords)) {
      portalRecords = [];
    }

    const firstDefinedNum = (...raws) => {
      for (const raw of raws) {
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
          return parseNum(raw);
        }
      }
      return 0;
    };

    /** ECH_query.sql uses employeename + NetCameraHours; portal uses UserName / NetHours / CameraNetHours */
    const normalizeDBRecord = (record) => {
      const storeName = String(pickField(record, 'StoreName', 'storeName', 'storename') ?? '').trim();
      const userName = String(
        pickField(
          record,
          'UserName',
          'userName',
          'username',
          'User_Name',
          'employeename',
          'employeeName',
          'EmployeeName',
          'employee_name'
        ) ?? ''
      ).trim();
      const rawNet = pickField(record, 'NetHours', 'netHours', 'nethours');
      const rawNetCam = pickField(record, 'NetCameraHours', 'netCameraHours', 'netcamerahours');
      const rawCamNet = pickField(record, 'CameraNetHours', 'cameraNetHours', 'cameranethours');
      const net = firstDefinedNum(rawNet, rawNetCam, rawCamNet);
      const cam = firstDefinedNum(rawCamNet, rawNetCam, rawNet);
      const monExplicit = pickField(record, 'MonitoredPercent', 'monitoredPercent', 'monitoredpercent');
      let monitored = 0;
      if (monExplicit !== undefined && monExplicit !== null && String(monExplicit).trim() !== '') {
        monitored = parseNum(monExplicit);
      } else {
        const md = parseNum(pickField(record, 'MonitorDays', 'monitorDays', 'monitordays'));
        const td = parseNum(pickField(record, 'TotalDays', 'totalDays', 'totaldays'));
        monitored = td > 0 ? Math.round((md / td) * 10000) / 100 : 0;
      }
      return {
        RM: String(pickField(record, 'RM', 'rm') ?? '').trim(),
        DM: String(pickField(record, 'DM', 'dm') ?? '').trim(),
        StoreName: storeName,
        UserName: userName,
        CameraNetHours: cam,
        NetHours: net,
        MonitoredPercent: monitored,
        uniqueKey: `${normalizeKeyPart(storeName)}_${normalizeKeyPart(userName)}`
      };
    };

    const normalizePortalRecord = (record) => {
      const storeName = String(pickField(record, 'StoreName', 'storeName', 'storename') ?? '').trim();
      const userName = String(pickField(record, 'UserName', 'userName', 'username') ?? '').trim();
      const cam = parseNum(pickField(record, 'CameraNetHours', 'cameraNetHours', 'cameranethours'));
      const netRaw = pickField(record, 'NetHours', 'netHours', 'nethours');
      const net =
        netRaw !== undefined && netRaw !== null && String(netRaw).trim() !== '' ? parseNum(netRaw) : cam;
      return {
        RM: String(pickField(record, 'RM', 'rm') ?? '').trim(),
        DM: String(pickField(record, 'DM', 'dm') ?? '').trim(),
        StoreName: storeName,
        UserName: userName,
        CameraNetHours: cam,
        NetHours: net,
        MonitoredPercent: parseNum(pickField(record, 'MonitoredPercent', 'monitoredPercent', 'monitoredpercent')),
        uniqueKey: `${normalizeKeyPart(storeName)}_${normalizeKeyPart(userName)}`
      };
    };

    const shouldFilterRecord = (record) => {
      const userName = String(record.UserName || '').trim().toLowerCase();
      const storeName = String(record.StoreName || '').trim().toLowerCase();
      const rm = String(record.RM || '').trim().toLowerCase();
      const dm = String(record.DM || '').trim().toLowerCase();

      if (!userName || userName.length === 0) {
        return true;
      }

      if (userName.includes('total') || storeName.includes('total')) {
        return true;
      }

      const headerValues = [
        'rm',
        'dm',
        'store name',
        'storename',
        'user name',
        'username',
        'camera net hours',
        'cameranethours',
        'monitored',
        'monitoredpercent',
        'monitored percent',
        'monitored days',
        'total days',
        'net hours'
      ];
      if (
        headerValues.includes(userName) ||
        headerValues.includes(storeName) ||
        headerValues.includes(rm) ||
        headerValues.includes(dm)
      ) {
        return true;
      }

      return false;
    };

    const normalizedDB = dbRecords.map(normalizeDBRecord);
    const normalizedPortal = portalRecords.map(normalizePortalRecord);

    const filteredDB = normalizedDB.filter((record) => !shouldFilterRecord(record));
    const filteredPortal = normalizedPortal.filter((record) => !shouldFilterRecord(record));

    console.log(
      `📊 Filtered records: DB ${normalizedDB.length} → ${filteredDB.length}, Portal ${normalizedPortal.length} → ${filteredPortal.length}`
    );
    if (normalizedDB.length > 0 && filteredDB.length === 0) {
      console.warn(
        '⚠️ DB: every row was filtered out (usually missing UserName / wrong JSON keys). Comparison Excel "DB Data" will be empty.'
      );
    }
    if (normalizedPortal.length > 0 && filteredPortal.length === 0) {
      console.warn('⚠️ Portal: every row was filtered out. Comparison Excel "Portal Data" will be empty.');
    }

    const dbMap = new Map();
    filteredDB.forEach((record) => {
      if (dbMap.has(record.uniqueKey)) {
        console.warn(`⚠️ Duplicate DB row for key "${record.uniqueKey}" — keeping first occurrence`);
        return;
      }
      dbMap.set(record.uniqueKey, record);
    });

    const portalMap = new Map();
    filteredPortal.forEach((record) => {
      if (portalMap.has(record.uniqueKey)) {
        console.warn(`⚠️ Duplicate Portal row for key "${record.uniqueKey}" — keeping first occurrence`);
        return;
      }
      portalMap.set(record.uniqueKey, record);
    });

    const allKeys = new Set([...dbMap.keys(), ...portalMap.keys()]);

    const differences = [];
    const dbOnly = [];
    const portalOnly = [];

    allKeys.forEach((key) => {
      const dbRecord = dbMap.get(key);
      const portalRecord = portalMap.get(key);

      if (!dbRecord && portalRecord) {
        portalOnly.push({
          uniqueKey: key,
          StoreName: portalRecord.StoreName,
          UserName: portalRecord.UserName,
          ...portalRecord
        });
        differences.push({
          uniqueKey: key,
          status: 'PORTAL_ONLY',
          comparisonSummary: 'Record exists only in Portal data',
          RM: '',
          DM: '',
          StoreName: '',
          UserName: '',
          NetHours: '',
          CameraNetHours: '',
          MonitoredPercent: '',
          portal_RM: portalRecord.RM,
          portal_DM: portalRecord.DM,
          portal_StoreName: portalRecord.StoreName,
          portal_UserName: portalRecord.UserName,
          portal_NetHours: portalRecord.NetHours,
          portal_CameraNetHours: portalRecord.CameraNetHours,
          portal_MonitoredPercent: portalRecord.MonitoredPercent
        });
      } else if (dbRecord && !portalRecord) {
        dbOnly.push({
          uniqueKey: key,
          StoreName: dbRecord.StoreName,
          UserName: dbRecord.UserName,
          ...dbRecord
        });
        differences.push({
          uniqueKey: key,
          status: 'DB_ONLY',
          comparisonSummary: 'Record exists only in DB data',
          RM: dbRecord.RM,
          DM: dbRecord.DM,
          StoreName: dbRecord.StoreName,
          UserName: dbRecord.UserName,
          CameraNetHours: dbRecord.CameraNetHours,
          NetHours: dbRecord.NetHours,
          MonitoredPercent: dbRecord.MonitoredPercent,
          portal_RM: '',
          portal_DM: '',
          portal_StoreName: '',
          portal_UserName: '',
          portal_NetHours: '',
          portal_CameraNetHours: '',
          portal_MonitoredPercent: ''
        });
      } else if (dbRecord && portalRecord) {
        const mismatches = [];

        const fieldsToCompare = [
          { name: 'RM', dbValue: dbRecord.RM, portalValue: portalRecord.RM },
          { name: 'DM', dbValue: dbRecord.DM, portalValue: portalRecord.DM },
          { name: 'StoreName', dbValue: dbRecord.StoreName, portalValue: portalRecord.StoreName },
          { name: 'UserName', dbValue: dbRecord.UserName, portalValue: portalRecord.UserName },
          { name: 'NetHours', dbValue: dbRecord.NetHours, portalValue: portalRecord.NetHours },
          { name: 'CameraNetHours', dbValue: dbRecord.CameraNetHours, portalValue: portalRecord.CameraNetHours },
          {
            name: 'MonitoredPercent',
            dbValue: dbRecord.MonitoredPercent,
            portalValue: portalRecord.MonitoredPercent
          }
        ];

        fieldsToCompare.forEach((field) => {
          const dbVal = field.dbValue;
          const portalVal = field.portalValue;

          if (field.name === 'NetHours' || field.name === 'CameraNetHours' || field.name === 'MonitoredPercent') {
            const dbNum = parseNum(dbVal);
            const portalNum = parseNum(portalVal);
            if (Math.abs(dbNum - portalNum) > 0.01) {
              mismatches.push(`${field.name}: DB="${dbNum}" Portal="${portalNum}"`);
            }
          } else {
            const dbStr = normalizeKeyPart(dbVal);
            const portalStr = normalizeKeyPart(portalVal);
            if (dbStr !== portalStr) {
              mismatches.push(`${field.name}: DB="${dbVal}" Portal="${portalVal}"`);
            }
          }
        });

        if (mismatches.length > 0) {
          differences.push({
            uniqueKey: key,
            status: 'DIFFERENT',
            comparisonSummary: mismatches.join('; '),
            RM: dbRecord.RM,
            DM: dbRecord.DM,
            StoreName: dbRecord.StoreName || portalRecord.StoreName,
            UserName: dbRecord.UserName,
            NetHours: dbRecord.NetHours,
            CameraNetHours: dbRecord.CameraNetHours,
            MonitoredPercent: dbRecord.MonitoredPercent,
            portal_RM: portalRecord.RM,
            portal_DM: portalRecord.DM,
            portal_StoreName: portalRecord.StoreName,
            portal_UserName: portalRecord.UserName,
            portal_NetHours: portalRecord.NetHours,
            portal_CameraNetHours: portalRecord.CameraNetHours,
            portal_MonitoredPercent: portalRecord.MonitoredPercent
          });
        }
      }
    });

    const workbook = XLSX.utils.book_new();

    const dbHeaders = ['RM', 'DM', 'StoreName', 'UserName', 'NetHours', 'CameraNetHours', 'MonitoredPercent'];
    const dbSheetData = [dbHeaders];
    filteredDB.forEach((record) => {
      dbSheetData.push(dbHeaders.map((header) => record[header] ?? ''));
    });
    const dbWorksheet = XLSX.utils.aoa_to_sheet(dbSheetData);
    XLSX.utils.book_append_sheet(workbook, dbWorksheet, 'DB Data');

    const portalHeaders = ['RM', 'DM', 'StoreName', 'UserName', 'NetHours', 'CameraNetHours', 'MonitoredPercent'];
    const portalSheetData = [portalHeaders];
    filteredPortal.forEach((record) => {
      portalSheetData.push(portalHeaders.map((header) => record[header] ?? ''));
    });
    const portalWorksheet = XLSX.utils.aoa_to_sheet(portalSheetData);
    XLSX.utils.book_append_sheet(workbook, portalWorksheet, 'Portal Data');

    const diffHeaders = [
      'status',
      'RM',
      'DM',
      'StoreName',
      'UserName',
      'NetHours',
      'CameraNetHours',
      'MonitoredPercent',
      'portal_RM',
      'portal_DM',
      'portal_StoreName',
      'portal_UserName',
      'portal_NetHours',
      'portal_CameraNetHours',
      'portal_MonitoredPercent',
      'comparisonSummary'
    ];
    const diffSheetData = [diffHeaders];

    differences.forEach((diff) => {
      const row = diffHeaders.map((header) => {
        if (header === 'comparisonSummary') {
          return diff[header] || '';
        }
        return diff[header] || '';
      });
      diffSheetData.push(row);
    });

    const diffWorksheet = XLSX.utils.aoa_to_sheet(diffSheetData);

    const range = XLSX.utils.decode_range(diffWorksheet['!ref'] || 'A1');
    for (let R = 1; R <= range.e.r; R++) {
      const diff = differences[R - 1];
      if (diff) {
        const statusCell = XLSX.utils.encode_cell({ r: R, c: 0 });
        if (diffWorksheet[statusCell]) {
          const statusPrefix =
            diff.status === 'DIFFERENT' ? '⚠️ ' : diff.status === 'DB_ONLY' ? '🔴 ' : diff.status === 'PORTAL_ONLY' ? '🟢 ' : '';
          if (statusPrefix && !diffWorksheet[statusCell].v?.startsWith(statusPrefix)) {
            diffWorksheet[statusCell].v = statusPrefix + (diffWorksheet[statusCell].v || diff.status);
          }
        }
      }
    }

    const colWidths = diffHeaders.map((header) => {
      if (header === 'comparisonSummary') {
        return { wch: 80 };
      }
      if (header === 'status') {
        return { wch: 15 };
      }
      if (header.startsWith('portal_')) {
        return { wch: 18 };
      }
      return { wch: 20 };
    });
    diffWorksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, diffWorksheet, 'Differences');

    const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9]/g, '_');
    const excelFileName = `${sanitizedClientName}-comparison-${clientId}-${Date.now()}.xlsx`;
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const excelDir = path.join(logsDir, 'comparison');
    if (!fs.existsSync(excelDir)) {
      fs.mkdirSync(excelDir, { recursive: true });
    }
    const excelFilePath = path.join(excelDir, excelFileName);

    XLSX.writeFile(workbook, excelFilePath);

    return {
      success: true,
      filePath: excelFilePath,
      fileName: excelFileName,
      stats: {
        totalDBRecords: filteredDB.length,
        totalPortalRecords: filteredPortal.length,
        differences: differences.length,
        dbOnly: dbOnly.length,
        portalOnly: portalOnly.length,
        matching: filteredDB.length - differences.filter((d) => d.status === 'DIFFERENT' || d.status === 'DB_ONLY').length
      }
    };
  } catch (error) {
    console.error('❌ Error in comparison function:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  compareDBAndPortal,
  resolveDbJsonPath,
  listPortalCandidates,
  normalizeKeyPart
};
