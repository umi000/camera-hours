DROP TABLE IF EXISTS #CompanyDetails,#truncated, #CompanyCred, #finalCredentials, #Count, #updatedURL48, #updatedURL52;
USE master;

DECLARE @companyid INT = -1;
DECLARE @tempcompanyID INT;
DECLARE @landingURL VARCHAR(MAX);
DECLARE @LiveServerIP VARCHAR(MAX);
DECLARE @tempcompanyName VARCHAR(MAX);
DECLARE @tempdbName VARCHAR(MAX);
DECLARE @companyname VARCHAR(MAX);
DECLARE @sqlCommand VARCHAR(MAX);
DECLARE @linkserver VARCHAR(MAX);
DECLARE @count VARCHAR(MAX);
DECLARE @loop INT = 1;

CREATE TABLE #CompanyCred(UserID VARCHAR(MAX), Passwords VARCHAR(MAX), companyID INT);

DECLARE @companytemp TABLE (
    id INT IDENTITY(1,1),
    companyID VARCHAR(MAX),
    DBname VARCHAR(MAX),
    landingURL VARCHAR(MAX),
    LiveServerIP VARCHAR(MAX),
    linkserver VARCHAR(MAX)
);

IF @companyid = -1
BEGIN
    INSERT INTO @companytemp
    EXEC('
        SELECT c.companyid, c.DBName, c.landingURL, LiveServerIP, cs.linkserver INTO #temp1
        FROM server48.centralhub.dbo.Company c
        INNER JOIN server48.CentralHub.dbo.company_servers cs ON cs.IPAddress = c.LiveServerIP
        INNER JOIN server48.centralhub.dbo.appcompanymapp mapp ON c.companyID = mapp.companyid
        INNER JOIN server48.centralhub.dbo.application App ON mapp.applicationid = App.applicationid
        WHERE isactive = 1 AND dbname IS NOT NULL 
          AND c.companyid NOT IN (232,221,244127,118,90,63,227,16,19,26,244)
          AND LiveServerIP IS NOT NULL
          AND companyname IS NOT NULL
          AND LiveServerIP LIKE ''%74.214.18.48%''
        ORDER BY c.companyID ASC;

        SELECT c.companyid, c.DBName, c.landingURL, LiveServerIP, cs.linkserver INTO #temp3
        FROM server52.centralhub.dbo.Company c
        INNER JOIN server48.CentralHub.dbo.company_servers cs ON cs.IPAddress = c.LiveServerIP
        INNER JOIN server52.centralhub.dbo.appcompanymapp mapp ON c.companyID = mapp.companyid
        INNER JOIN server52.centralhub.dbo.application App ON mapp.applicationid = App.applicationid
        WHERE isactive = 1 AND dbname IS NOT NULL
          AND c.companyid NOT IN (229,140,131,127,118,80,63,19,206,45,16,200,8,85,2,42,9,14,157,165,220,221,26)
          AND companyname IS NOT NULL
          AND LiveServerIP IS NOT NULL
          AND LiveServerIP LIKE ''%74.214.18.52%''
        ORDER BY c.companyID ASC;

        SELECT * FROM #temp1
        UNION
        SELECT * FROM #temp3
    ');
END;

SELECT * INTO #CompanyDetails FROM @companytemp;
CREATE TABLE #Count([Count] INT);

WHILE @loop <= (SELECT COUNT(*) FROM @companytemp)
BEGIN
    SELECT @tempcompanyID = companyID,
           @tempdbName = Dbname,
           @landingURL = landingURL,
           @LiveServerIP = LiveServerIP,
           @linkserver = linkserver
    FROM @companytemp WHERE id = @loop;

    -- Case 1: Server 48
    IF (@LiveServerIP = '74.214.18.48')
    BEGIN
        SET @count = 'SELECT COUNT(*) FROM ' + @linkserver + '.' + @tempdbName + '.dbo.CustomerConversionFlatten';
        BEGIN TRY
            INSERT INTO #Count EXEC (@count);
        END TRY
        BEGIN CATCH
            PRINT 'Skipping missing table for DB: ' + ISNULL(@tempdbName, '');
            INSERT INTO #Count VALUES (0);
        END CATCH;

        IF ((SELECT TOP 1 [Count] FROM #Count) > 0)
        BEGIN
            SET @sqlCommand = 'SELECT userID,
                                      CONVERT(VARCHAR(MAX), DecryptByPassPhrase(''' + CONVERT(VARCHAR(MAX), @tempcompanyID) + ''', password)) AS password,
                                      ''' + CONVERT(VARCHAR(MAX), @tempcompanyID) + '''
                               FROM ' + @linkserver + '.' + @tempdbName + '.dbo.EmployeeInformation
                               WHERE userID LIKE ''%superadmin@%'' and  isvirtualemployee=1' ;
            BEGIN TRY
                INSERT INTO #CompanyCred EXEC (@sqlCommand);
            END TRY
            BEGIN CATCH
                PRINT 'Failed to fetch creds for CompanyID: ' + CAST(@tempcompanyID AS VARCHAR);
            END CATCH;
        END
    END

    -- Case 2: Server 52
    ELSE IF (@LiveServerIP = '74.214.18.52')
    BEGIN
        SET @count = 'SELECT COUNT(*) FROM ' + @linkserver + '.' + @tempdbName + '.dbo.CustomerConversionFlatten';
        BEGIN TRY
            INSERT INTO #Count EXEC (@count);
        END TRY
        BEGIN CATCH
            PRINT 'Skipping missing table for DB: ' + ISNULL(@tempdbName, '') + ' on ' + ISNULL(@linkserver, '');
            INSERT INTO #Count VALUES (0);
        END CATCH;

        IF ((SELECT TOP 1 [Count] FROM #Count) > 0)
        BEGIN
            SET @sqlCommand = 'SELECT userID,
                                      CONVERT(VARCHAR(MAX), DecryptByPassPhrase(''' + CONVERT(VARCHAR(MAX), @tempcompanyID) + ''', password)) AS password,
                                      ''' + CONVERT(VARCHAR(MAX), @tempcompanyID) + '''
                               FROM ' + @linkserver + '.' + @tempdbName + '.dbo.EmployeeInformation
                               WHERE userID LIKE ''%superadmin@%'' and  isvirtualemployee=1';
            BEGIN TRY
                INSERT INTO #CompanyCred EXEC (@sqlCommand);
            END TRY
            BEGIN CATCH
                PRINT 'Failed to fetch creds for CompanyID: ' + CAST(@tempcompanyID AS VARCHAR);
            END CATCH;
        END
    END

    -- Case 3: Other servers
    ELSE
    BEGIN
        SET @count = 'SELECT COUNT(*) FROM ' + @linkserver + '.' + @tempdbName + '.dbo.CustomerConversionFlatten';
        BEGIN TRY
            INSERT INTO #Count EXEC (@count);
        END TRY
        BEGIN CATCH
            PRINT 'Skipping missing table for DB: ' + ISNULL(@tempdbName, '') + ' on ' + ISNULL(@linkserver, '');
            INSERT INTO #Count VALUES (0);
        END CATCH;

        IF ((SELECT TOP 1 [Count] FROM #Count) > 0)
        BEGIN
            SET @sqlCommand = 'SELECT userID,
                                      CONVERT(VARCHAR(MAX), DecryptByPassPhrase(''' + CONVERT(VARCHAR(MAX), @tempcompanyID) + ''', password)) AS password,
                                      ''' + CONVERT(VARCHAR(MAX), @tempcompanyID) + '''
                               FROM ' + @linkserver + '.' + @tempdbName + '.dbo.EmployeeInformation
                               WHERE userID LIKE ''%superadmin@%''and  isvirtualemployee=1';
            BEGIN TRY
                INSERT INTO #CompanyCred EXEC (@sqlCommand);
            END TRY
            BEGIN CATCH
                PRINT 'Failed to fetch creds for CompanyID: ' + CAST(@tempcompanyID AS VARCHAR);
            END CATCH;
        END
    END

    SET @loop = @loop + 1;
    TRUNCATE TABLE #Count;
END;

-- Build final credentials
SELECT cd.companyid,
       com.companyName,
       cc.userid,
       cc.passwords,
       cd.dbname,
       cd.landingurl,
       cd.liveserverip
INTO #finalCredentials
FROM #CompanyCred cc
INNER JOIN #CompanyDetails cd ON cc.companyid = cd.companyid
INNER JOIN centralhub.dbo.Company com ON com.companyID = cd.companyID;

-- Application mappings for server52
SELECT DISTINCT App.applicationname, App.applicationpath, c.companyID, c.companyname
INTO #updatedURL52
FROM server52.centralhub.dbo.appcompanymapp mapp
INNER JOIN server52.centralhub.dbo.application App ON mapp.applicationid = App.applicationid
INNER JOIN server52.centralhub.dbo.company c ON c.companyid = mapp.companyid
INNER JOIN server52.centralhub.dbo.[authorization] ath ON ath.appcompanymapid = mapp.appcompanymapid
WHERE c.companyid IN (63,79,93,213,228)
  AND App.applicationPath NOT IN ('#')
  AND ath.designationid = 100
ORDER BY App.applicationPath, c.companyName;

-- Application mappings for server48
SELECT DISTINCT App.applicationname, App.applicationpath, c.companyID, c.companyname
INTO #updatedURL48
FROM server48.centralhub.dbo.appcompanymapp mapp
INNER JOIN server48.centralhub.dbo.application App ON mapp.applicationid = App.applicationid
INNER JOIN server48.centralhub.dbo.company c ON c.companyid = mapp.companyid
INNER JOIN server48.centralhub.dbo.[authorization] ath ON ath.appcompanymapid = mapp.appcompanymapid
WHERE App.applicationPath NOT IN ('#')
  AND ath.designationid = 100
ORDER BY App.applicationPath, c.companyName;

-- Final Combined Output
SELECT 
    fc.companyid,
    fc.companyName,
    fc.userid,
    fc.passwords AS [password],
    fc.dbname,
    fc.liveserverip, -- <--- Added Column
    CASE
        WHEN RIGHT(fc.landingURL, 1) = '/'
            THEN CONCAT(REPLACE(fc.landingurl, 'http:', 'https:'), u48.applicationpath)
        ELSE CONCAT(REPLACE(fc.landingurl, 'http:', 'https:'), '/', u48.applicationpath)
    END AS applandingurl,
    CASE
        WHEN RIGHT(fc.landingURL, 1) = '/'
            THEN REPLACE(fc.landingurl, 'http:', 'https:')
        ELSE CONCAT(REPLACE(fc.landingurl, 'http:', 'https:'), '/')
    END AS landingurl into #truncated
FROM #finalCredentials fc
LEFT JOIN #updatedURL48 u48 ON u48.companyID = fc.companyID
WHERE u48.applicationName LIKE 'Employee Camera Hours'

UNION

SELECT 
    fc.companyid,
    fc.companyName,
    fc.userid,
    fc.passwords AS [password],
    fc.dbname,
    fc.liveserverip, -- <--- Added Column
    CASE
        WHEN RIGHT(fc.landingURL, 1) = '/'
            THEN CONCAT(REPLACE(fc.landingurl, 'http:', 'https:'), u52.applicationpath)
        ELSE CONCAT(REPLACE(fc.landingurl, 'http:', 'https:'), '/', u52.applicationpath)
    END AS applandingurl,
    CASE
        WHEN RIGHT(fc.landingURL, 1) = '/'
            THEN REPLACE(fc.landingurl, 'http:', 'https:')
        ELSE CONCAT(REPLACE(fc.landingurl, 'http:', 'https:'), '/')
    END AS landingurl
FROM #finalCredentials fc
LEFT JOIN #updatedURL52 u52 ON u52.companyID = fc.companyID
WHERE u52.applicationName LIKE 'Employee Camera Hours'
ORDER BY fc.companyName;

SELECT * FROM #truncated
WHERE applandingurl LIKE '%EmployeeCameraHours'
  AND companyname NOT LIKE '%test%'
  AND companyname NOT LIKE '%demo%'
  order by 2;