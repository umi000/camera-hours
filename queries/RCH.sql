SET NOCOUNT ON;

DECLARE @StartDate DATE = '2021-12-01';
DECLARE @EndDate DATE = '2021-12-31';

-- 1. Get Store Hierarchy (Map Stores to RMs)
IF OBJECT_ID('tempdb..#Stores') IS NOT NULL DROP TABLE #Stores;
SELECT DISTINCT 
    74 as companyID, 
    AM, 
    RM, -- Grouping target
    StoreID
INTO #Stores 
FROM storehierarchy 
WHERE MONTH(fileDate) = MONTH(@EndDate) AND YEAR(fileDate) = YEAR(@EndDate);

-- 2. Flatten Employee Hours (Raw Minutes per Store)
IF OBJECT_ID('tempdb..#EmployeeHoursFlatten') IS NOT NULL DROP TABLE #EmployeeHoursFlatten;
SELECT  
    sm.monitoringForDate AS businessDateDim, 
    sm.storeID, 
    SUM(DATEDIFF(mi, punchintime, punchouttime)) AS netMinutes 
INTO #EmployeeHoursFlatten 
FROM storemonitoring sm 
INNER JOIN employeeinandout ei ON sm.storemonitoringid = ei.storemonitoringid 
INNER JOIN #Stores s ON sm.storeID = s.StoreID 
WHERE CAST(ei.punchintime AS DATE) BETWEEN @StartDate AND @EndDate 
GROUP BY sm.monitoringForDate, sm.storeID;

-- 3. Calculate Store-Level Monitor Days
IF OBJECT_ID('tempdb..#StoreActivity') IS NOT NULL DROP TABLE #StoreActivity;
SELECT 
    storeid, 
    COUNT(DISTINCT businessDateDim) AS MonitorDaysCount
INTO #StoreActivity
FROM #EmployeeHoursFlatten
GROUP BY storeid;

-- 4. Calculate Total Days store was Open
IF OBJECT_ID('tempdb..#TotalDaysCount') IS NOT NULL DROP TABLE #TotalDaysCount;
SELECT 
    s.StoreID, 
    COUNT(DISTINCT soc.processDate) AS TotalOpenDays
INTO #TotalDaysCount
FROM StoreOpenCloseDatesFlatten soc 
INNER JOIN #Stores s ON soc.storeID = s.StoreID 
WHERE soc.processDate BETWEEN @StartDate AND @EndDate AND soc.isClosed = 0
GROUP BY s.StoreID;

-- 5. Final Output: Pure Regional (RM) Level Aggregation
SELECT 
    st.companyID,
    st.AM,
    st.RM, 
    -- Total hours for every store in the entire Region
    CAST(SUM(ISNULL(ehf.netMinutes, 0)) / 60.0 AS DECIMAL(10, 2)) AS RegionalTotalHours,
    -- Sum of monitored days across all stores in the Region
    SUM(ISNULL(sa.MonitorDaysCount, 0)) AS RegionalMonitorDays,
    -- Sum of total open days across all stores in the Region
    SUM(ISNULL(tdc.TotalOpenDays, 0)) AS RegionalTotalOpenDays,
    -- Regional Performance Percentage
    CASE 
        WHEN SUM(ISNULL(tdc.TotalOpenDays, 0)) > 0 
        THEN CAST((SUM(ISNULL(sa.MonitorDaysCount, 0)) * 100.0) / SUM(ISNULL(tdc.TotalOpenDays, 0)) AS DECIMAL(10, 2))
        ELSE 0 
    END AS RegionalMonitoredPercent
FROM #Stores st
LEFT JOIN #EmployeeHoursFlatten ehf ON st.StoreID = ehf.storeID
LEFT JOIN #StoreActivity sa ON st.StoreID = sa.storeid
LEFT JOIN #TotalDaysCount tdc ON st.StoreID = tdc.StoreID
GROUP BY 
    st.companyID, 
    st.AM, 
    st.RM
ORDER BY st.RM;

-- Cleanup
DROP TABLE #EmployeeHoursFlatten;
DROP TABLE #Stores;
DROP TABLE #StoreActivity;
DROP TABLE #TotalDaysCount;