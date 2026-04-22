SET NOCOUNT ON;

DECLARE @StartDate DATE = '2021-12-01';
DECLARE @EndDate DATE = '2021-12-31';
-- 1. Handle Null Dates
IF @StartDate IS NULL SET @StartDate = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0);
IF @EndDate IS NULL SET @EndDate = GETDATE();
-- 1. Filter Store Hierarchy (Restricted to Store 6166)
IF OBJECT_ID('tempdb..#Stores') IS NOT NULL DROP TABLE #Stores;
SELECT DISTINCT 74 as companyID, AM, RM, DM, SM, StoreID, StoreName INTO #Stores 
FROM dbo.storehierarchy 
WHERE  MONTH(fileDate) = MONTH(@EndDate) 
  AND YEAR(fileDate) = YEAR(@EndDate);

-- 2. Flatten Employee Hours (Restricted to Employee 1024)
IF OBJECT_ID('tempdb..#EmployeeHoursFlatten') IS NOT NULL DROP TABLE #EmployeeHoursFlatten;
SELECT 
    sm.storeMonitoringID,
    sm.monitoringForDate AS businessDateDim,
    sm.storeID,
    ei.employeeID,
    SUM(DATEDIFF(MINUTE, ei.punchintime, ei.PunchOuttime)) AS netHours
INTO #EmployeeHoursFlatten
FROM dbo.storemonitoring sm
INNER JOIN dbo.employeeinandout ei ON sm.storemonitoringid = ei.storemonitoringid
INNER JOIN #Stores s ON sm.storeID = s.StoreID
WHERE  CAST(ei.punchintime AS DATE) BETWEEN @StartDate AND @EndDate
GROUP BY sm.storeMonitoringID, sm.monitoringForDate, sm.storeID, ei.employeeID;

-- 3. Calculate Total Days store was OPEN (Production Logic)
IF OBJECT_ID('tempdb..#TotalMonitorDays') IS NOT NULL DROP TABLE #TotalMonitorDays;
SELECT 
    s.StoreID, 
    CONVERT(DATETIME, CONVERT(VARCHAR(10), soc.processDate, 101)) AS TotalDays
INTO #TotalMonitorDays
FROM dbo.StoreOpenCloseDatesFlatten soc
INNER JOIN #Stores s ON soc.storeID = s.StoreID
WHERE soc.processDate BETWEEN @StartDate AND @EndDate 
  AND soc.isClosed = 0;

-- 4. Get Store-level Monitor Days (Match Production logic: Count days ANYONE worked at this store)
-- This is where the previous versions were failing.
IF OBJECT_ID('tempdb..#StoreLevelMonitorDays') IS NOT NULL DROP TABLE #StoreLevelMonitorDays;
SELECT 
    sm.storeID,
    COUNT(DISTINCT sm.monitoringForDate) AS MonitorDaysCount
INTO #StoreLevelMonitorDays
FROM dbo.storemonitoring sm
INNER JOIN #Stores s ON sm.storeID = s.StoreID
INNER JOIN dbo.employeeinandout ei ON sm.storemonitoringid = ei.storemonitoringid
WHERE CAST(ei.punchintime AS DATE) BETWEEN @StartDate AND @EndDate
GROUP BY sm.storeID;

select
    74 AS companyID,
    st.AM,
    st.RM,
    st.DM,
    st.SM,
    st.StoreID,
    st.StoreName,
    CAST(SUM(ehf.netHours) / 60.0 AS DECIMAL(10,2)) AS NetCameraHours,
    MAX(slm.MonitorDaysCount) AS MonitorDays, -- Uses the Store-level count
    (SELECT COUNT(TotalDays) FROM dbo.#TotalMonitorDays WHERE StoreID = st.StoreID) AS TotalDays
	into #last
FROM dbo.#EmployeeHoursFlatten ehf
INNER JOIN #Stores st ON st.StoreID = ehf.storeID
INNER JOIN dbo.employeeinformation ei ON ehf.employeeID = ei.employeeID
LEFT JOIN #StoreLevelMonitorDays slm ON st.StoreID = slm.storeID
GROUP BY 
    st.AM, st.RM, st.DM, st.SM, st.StoreID, st.StoreName;
	select RM,DM,SM,StoreName, NetCameraHours,MonitorDays,  TotalDays from #last
-- Cleanup
DROP TABLE #Stores,#last ,#EmployeeHoursFlatten, #TotalMonitorDays ,#StoreLevelMonitorDays;