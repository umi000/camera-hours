
    SET NOCOUNT ON;
    SET FMTONLY OFF;
	--Declare @StartDate date = '12/01/2025';
	--Declare @EndDate Date = '12/31/2025';

    -- 1. Handle Null Dates
    IF @StartDate IS NULL SET @StartDate = DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0);
    IF @EndDate IS NULL SET @EndDate = GETDATE();

    -- 2. Filter Store Hierarchy once
    SELECT DISTINCT 74 AS companyID, AM, RM, DM, SM, StoreID, StoreName 
    INTO #Stores 
    FROM {SERVER_NAME}.[{DBNAME}].dbo.storehierarchy 
    WHERE fileDate >= DATEFROMPARTS(YEAR(@EndDate), MONTH(@EndDate), 1)
      AND fileDate < DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(@EndDate), MONTH(@EndDate), 1));

    -- 3. Pre-calculate Total Open Days per Store
    SELECT 
        soc.storeID, 
        COUNT(DISTINCT soc.processDate) as TotalDaysCount
    INTO #TotalMonitorDays
    FROM {SERVER_NAME}.[{DBNAME}].dbo.StoreOpenCloseDatesFlatten soc
    INNER JOIN #Stores s ON soc.storeID = s.StoreID
    WHERE soc.processDate >= @StartDate AND soc.processDate <= @EndDate 
      AND soc.isClosed = 0
    GROUP BY soc.storeID;

    -- 4. Calculate Hours and Aggregate
    -- We aggregate IDs first, then join names later for speed
    ;WITH EmployeeHours AS (
        SELECT 
            sm.storeID,
            ei.employeeID,
            sm.monitoringForDate AS businessDate,
            SUM(DATEDIFF(MINUTE, punchintime, PunchOuttime)) AS netHours
        FROM {SERVER_NAME}.[{DBNAME}].dbo.storemonitoring sm 
        INNER JOIN {SERVER_NAME}.[{DBNAME}].dbo.employeeinandout ei ON sm.storemonitoringid = ei.storemonitoringid 
        INNER JOIN #Stores s ON sm.storeID = s.StoreID 
        -- SARGable date filter (allows index use)
        WHERE ei.punchintime >= @StartDate AND ei.punchintime < DATEADD(DAY, 1, @EndDate)
        GROUP BY sm.storeID, ei.employeeID, sm.monitoringForDate
    ),
    AggregatedData AS (
        SELECT 
            st.AM, st.RM, st.DM, st.SM, st.StoreID, st.StoreName,
            eh.employeeID,
            SUM(eh.netHours) AS NetCameraHours,
            COUNT(DISTINCT eh.businessDate) AS MonitorDays
        FROM EmployeeHours eh
        INNER JOIN #Stores st ON eh.storeID = st.StoreID
        GROUP BY st.AM, st.RM, st.DM, st.SM, st.StoreID, st.StoreName, eh.employeeID
    )

    -- 5. Final Output: Join Name and Total Days here
    SELECT ad.RM, ad.DM, ad.SM,  ad.StoreName, 
        info.userName AS UserName, -- Joined here to fix the error
        CAST(ROUND(ad.NetCameraHours / 60.0, 2) AS DECIMAL(10, 2)) AS CameraNetHours,
        ad.MonitorDays AS monitoreddays,
        ISNULL(tmd.TotalDaysCount, 0) AS totaldays,
        CASE 
            WHEN ISNULL(tmd.TotalDaysCount, 0) > 0 
            THEN CAST(ROUND((CAST(ad.MonitorDays AS FLOAT) / CAST(tmd.TotalDaysCount AS FLOAT)) * 100, 2) AS DECIMAL(10, 2))
            ELSE CAST(0 AS DECIMAL(10, 2))
        END AS MonitoredPercent
    FROM AggregatedData ad
    INNER JOIN {SERVER_NAME}.[{DBNAME}].dbo.employeeinformation info ON ad.employeeID = info.employeeID
    LEFT JOIN #TotalMonitorDays tmd ON ad.StoreID = tmd.storeID;

    -- Cleanup
    DROP TABLE #Stores;
    DROP TABLE #TotalMonitorDays;

