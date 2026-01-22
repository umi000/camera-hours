// Employee Camera Hours automation audit Dashboard JavaScript Framework

class EmployeeCameraHoursAuditDashboard {
    constructor() {
        this.clients = [];
        this.isLoading = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupThemeToggle();
        this.loadLastUpdatedTime(); // Load and display last updated time
        this.loadClients(); // Load from JSON file on startup
        this.setDefaultDates();
        this.setupLogsModal(); // Setup logs modal
        
        // Set default report options after a short delay to ensure dropdowns are initialized
        setTimeout(() => {
            this.setDefaultReportOptions();
        }, 200);
    }


    setupEventListeners() {
        // Client selection
        document.getElementById('clientSelectTrigger').addEventListener('click', () => {
            this.toggleClientDropdown();
        });

        document.getElementById('clientSearch').addEventListener('input', (e) => {
            this.filterClients(e.target.value);
        });

        document.getElementById('selectAllBtn').addEventListener('click', () => {
            this.selectAllClients();
        });

        document.getElementById('clearAllBtn').addEventListener('click', () => {
            this.clearAllClients();
        });


        // Logs button
        const viewLogsBtn = document.getElementById('viewLogsBtn');
        if (viewLogsBtn) {
            viewLogsBtn.addEventListener('click', () => {
                this.openLogsModal();
            });
        }

        // Actions
        const generateBtn = document.getElementById('generateReportBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔘 Generate Report button clicked');
                this.generateReport();
            });
        } else {
            console.error('❌ Generate Report button not found in DOM!');
        }

        document.getElementById('clearFormBtn').addEventListener('click', () => {
            this.clearForm();
        });

        // Console actions
        const clearConsoleBtn = document.getElementById('clearConsoleBtn');
        const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
        
        if (clearConsoleBtn) {
            clearConsoleBtn.addEventListener('click', () => {
                this.clearConsole();
            });
        }
        
        if (scrollToBottomBtn) {
            scrollToBottomBtn.addEventListener('click', () => {
                this.scrollConsoleToBottom();
            });
        }

        // Custom calendar handlers
        this.setupCustomCalendars();

        // Custom dropdown handlers
        this.setupCustomDropdowns();
    }

    setupThemeToggle() {
        const themeToggle = document.getElementById('themeToggle');
        const themeIcon = themeToggle.querySelector('.icon');
        const themeText = themeToggle.querySelector('.text');
        
        // Always set default theme to dark on every reload
        document.documentElement.setAttribute('data-theme', 'dark');
        themeIcon.textContent = '☀️';
        themeText.textContent = 'Light Mode';
        
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            
            if (newTheme === 'dark') {
                themeIcon.textContent = '☀️';
                themeText.textContent = 'Light Mode';
            } else {
                themeIcon.textContent = '🌙';
                themeText.textContent = 'Dark Mode';
            }
        });
    }

    setupCustomCalendars() {
        const dateInputs = ['startDate', 'endDate'];
        
        dateInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            const trigger = document.querySelector(`[data-target="${inputId}"]`);
            const calendar = document.getElementById(`calendar-${inputId}`);
            
            if (input && trigger && calendar) {
                this.initCalendar(calendar, inputId);
                
                trigger.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showCalendar(calendar);
                });
                
                input.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showCalendar(calendar);
                });
                
                // Close calendar when clicking outside
                document.addEventListener('click', (e) => {
                    if (!calendar.contains(e.target) && !trigger.contains(e.target) && !input.contains(e.target)) {
                        calendar.classList.remove('show');
                    }
                });
            }
        });
    }

    initCalendar(calendarElement, inputId) {
        const today = new Date();
        const input = document.getElementById(inputId);
        
        // Get initial month/year from input value if it exists
        let currentMonth = today.getMonth();
        let currentYear = today.getFullYear();
        
        if (input && input.value) {
            try {
                // Parse MM/DD/YYYY format
                const dateParts = input.value.split('/');
                if (dateParts.length === 3) {
                    const month = parseInt(dateParts[0]) - 1; // Month is 0-indexed
                    const day = parseInt(dateParts[1]);
                    const year = parseInt(dateParts[2]);
                    const inputDate = new Date(year, month, day);
                    
                    if (!isNaN(inputDate.getTime())) {
                        currentMonth = inputDate.getMonth();
                        currentYear = inputDate.getFullYear();
                        // Store selected date for highlighting
                        calendarElement.dataset.selectedDate = inputDate.toISOString().split('T')[0];
                    }
                }
            } catch (e) {
                // Use today's date if parsing fails
            }
        }
        
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        // Store current month/year in closure for renderCalendar
        let storedMonth = currentMonth;
        let storedYear = currentYear;
        
        const renderCalendar = () => {
            // Use stored values that can be updated
            const firstDay = new Date(storedYear, storedMonth, 1);
            const lastDay = new Date(storedYear, storedMonth + 1, 0);
            const startDate = firstDay.getDay();
            const daysInMonth = lastDay.getDate();
            
            calendarElement.innerHTML = `
                <div class="calendar-header">
                    <button class="calendar-nav" data-action="prev">‹</button>
                    <div class="calendar-title">${monthNames[storedMonth]} ${storedYear}</div>
                    <button class="calendar-nav" data-action="next">›</button>
                </div>
                <div class="calendar-grid">
                    ${dayNames.map(day => `<div class="calendar-day-header">${day}</div>`).join('')}
                    ${Array.from({ length: startDate }, (_, i) => 
                        `<div class="calendar-day other-month">${new Date(storedYear, storedMonth, -startDate + i + 1).getDate()}</div>`
                    ).join('')}
                    ${Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const date = new Date(storedYear, storedMonth, day);
                        const isToday = date.toDateString() === today.toDateString();
                        const dateISO = date.toISOString().split('T')[0];
                        const isSelected = calendarElement.dataset.selectedDate === dateISO;
                        
                        // Also check if this date matches the input value
                        const input = document.getElementById(inputId);
                        let isInputSelected = false;
                        if (input && input.value) {
                            try {
                                const dateParts = input.value.split('/');
                                if (dateParts.length === 3) {
                                    const inputDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
                                    if (inputDate.toISOString().split('T')[0] === dateISO) {
                                        isInputSelected = true;
                                        calendarElement.dataset.selectedDate = dateISO;
                                    }
                                }
                            } catch (e) {
                                // Ignore parsing errors
                            }
                        }
                        
                        const isFuture = date > today;
                        const isSelectedFinal = isSelected || isInputSelected;
                        return `<div class="calendar-day ${isToday ? 'today' : ''} ${isSelectedFinal ? 'selected' : ''} ${isFuture ? 'disabled' : ''}" data-day="${day}" ${isFuture ? 'data-disabled="true"' : ''}>${day}</div>`;
                    }).join('')}
                </div>
                <div class="calendar-footer">
                    <button class="calendar-btn secondary" data-action="today">Today</button>
                    <button class="calendar-btn secondary" data-action="clear">Clear</button>
                </div>
            `;
            
            // Add event listeners
            calendarElement.querySelectorAll('.calendar-nav').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (e.target.dataset.action === 'prev') {
                        storedMonth--;
                        if (storedMonth < 0) {
                            storedMonth = 11;
                            storedYear--;
                        }
        } else {
                        storedMonth++;
                        if (storedMonth > 11) {
                            storedMonth = 0;
                            storedYear++;
                        }
                    }
                    renderCalendar();
                });
            });
            
            calendarElement.querySelectorAll('.calendar-day:not(.other-month)').forEach(day => {
                day.addEventListener('click', (e) => {
                    if (e.target.dataset.disabled === 'true') {
                        return;
                    }
                    
                    const dayNum = parseInt(e.target.dataset.day);
                    const selectedDate = new Date(storedYear, storedMonth, dayNum);
                    this.selectDate(selectedDate, inputId, calendarElement);
                });
            });
            
            calendarElement.querySelectorAll('.calendar-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (e.target.dataset.action === 'today') {
                        this.selectDate(today, inputId, calendarElement);
                    } else if (e.target.dataset.action === 'clear') {
                        this.clearDate(inputId, calendarElement);
                    }
                });
            });
        };
        
        // Update stored values from input if available
        if (input && input.value) {
            try {
                const dateParts = input.value.split('/');
                if (dateParts.length === 3) {
                    storedMonth = parseInt(dateParts[0]) - 1;
                    storedYear = parseInt(dateParts[2]);
                }
            } catch (e) {
                // Use defaults
            }
        }
        
        renderCalendar();
    }

    showCalendar(calendarElement) {
        // Close all other calendars first
        document.querySelectorAll('.custom-calendar').forEach(cal => {
            cal.classList.remove('show');
        });
        
        // Get the input associated with this calendar
        const inputId = calendarElement.id.replace('calendar-', '');
        const input = document.getElementById(inputId);
        
        // If input has a value, navigate calendar to that month
        if (input && input.value) {
            try {
                // Parse MM/DD/YYYY format
                const dateParts = input.value.split('/');
                if (dateParts.length === 3) {
                    const month = parseInt(dateParts[0]) - 1; // Month is 0-indexed
                    const day = parseInt(dateParts[1]);
                    const year = parseInt(dateParts[2]);
                    const inputDate = new Date(year, month, day);
                    
                    if (!isNaN(inputDate.getTime())) {
                        // Re-initialize calendar with the correct month/year
                        this.initCalendar(calendarElement, inputId);
                        // Store selected date for highlighting
                        calendarElement.dataset.selectedDate = inputDate.toISOString().split('T')[0];
                    }
                }
            } catch (e) {
                // Continue with default behavior if parsing fails
            }
        }
        
        // Simple show - let CSS handle positioning
        calendarElement.classList.add('show');
    }

    selectDate(date, inputId, calendarElement) {
        const input = document.getElementById(inputId);
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        input.value = formattedDate;
        calendarElement.dataset.selectedDate = date.toISOString().split('T')[0];
        calendarElement.classList.remove('show');
        
        // Validate form after date selection
        this.validateForm();
    }

    clearDate(inputId, calendarElement) {
        const input = document.getElementById(inputId);
        input.value = '';
        delete calendarElement.dataset.selectedDate;
        calendarElement.classList.remove('show');
        
        // Validate form after date is cleared
        this.validateForm();
    }

    setDefaultReportOptions() {
        // Set default Report Type to "summary"
        const reportTypeTrigger = document.getElementById('reportTypeTrigger');
        const reportTypeHidden = document.getElementById('reportTypeSelect');
        const reportTypeOption = document.querySelector('#reportTypeOptions .dropdown-option[data-value="summary"]');
        
        if (reportTypeTrigger && reportTypeHidden && reportTypeOption) {
            const text = reportTypeOption.textContent;
            reportTypeTrigger.querySelector('.dropdown-text').textContent = text;
            reportTypeHidden.value = 'summary';
        }
        
        // Set default Report Name to "employee-camera-hours"
        const reportNameTrigger = document.getElementById('reportNameTrigger');
        const reportNameHidden = document.getElementById('reportNameSelect');
        const reportNameOption = document.querySelector('#reportNameOptions .dropdown-option[data-value="employee-camera-hours"]');
        
        if (reportNameTrigger && reportNameHidden && reportNameOption) {
            const text = reportNameOption.textContent;
            reportNameTrigger.querySelector('.dropdown-text').textContent = text;
            reportNameHidden.value = 'employee-camera-hours';
        }
    }

    setupCustomDropdowns() {
        // Setup Report Type dropdown
        const reportTypeTrigger = document.getElementById('reportTypeTrigger');
        const reportTypeOptions = document.getElementById('reportTypeOptions');
        const reportTypeHidden = document.getElementById('reportTypeSelect');
        
        if (reportTypeTrigger && reportTypeOptions) {
            reportTypeOptions.querySelectorAll('.dropdown-option').forEach(option => {
                option.addEventListener('click', () => {
                    const value = option.dataset.value;
                    const text = option.textContent;
                    
                    reportTypeTrigger.querySelector('.dropdown-text').textContent = text;
                    reportTypeHidden.value = value;
                    
                    // Close dropdown
                    reportTypeOptions.style.display = 'none';
                    reportTypeOptions.style.opacity = '0';
                    reportTypeOptions.style.visibility = 'hidden';
                    reportTypeOptions.style.transform = 'translateY(-10px)';
                    
                    // Validate form after report type selection
                    this.validateForm();
                });
            });
        }

        // Setup Report Name dropdown
        const reportNameTrigger = document.getElementById('reportNameTrigger');
        const reportNameOptions = document.getElementById('reportNameOptions');
        const reportNameHidden = document.getElementById('reportNameSelect');
        
        if (reportNameTrigger && reportNameOptions) {
            reportNameOptions.querySelectorAll('.dropdown-option').forEach(option => {
                option.addEventListener('click', () => {
                    const value = option.dataset.value;
                    const text = option.textContent;
                    
                    reportNameTrigger.querySelector('.dropdown-text').textContent = text;
                    reportNameHidden.value = value;
                    
                    // Close dropdown
                    reportNameOptions.style.display = 'none';
                    reportNameOptions.style.opacity = '0';
                    reportNameOptions.style.visibility = 'hidden';
                    reportNameOptions.style.transform = 'translateY(-10px)';
                    
                    // Validate form after report name selection
                    this.validateForm();
                });
            });
        }
    }

    setDefaultDates() {
        const today = new Date();
        
        // Set default start date to 31 days ago
        const defaultStartDate = new Date(today);
        defaultStartDate.setDate(today.getDate() - 31);
        
        // Set end date to 2 days ago
        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(today.getDate() - 2);
        
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (startDateInput && endDateInput) {
            const formatDate = (date) => {
                return date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
            };
            
            startDateInput.value = formatDate(defaultStartDate);
            endDateInput.value = formatDate(twoDaysAgo); // Set end date to 2 days ago
            
            // Validate form after setting default dates
            this.validateForm();
        }
    }

    async loadClients() {
        try {
            this.showLoadingState(true);
            this.showSkeletonLoader();
            
            // Always try to load from JSON file first (most reliable source)
            try {
                const response = await fetch('clients-data-manual.json');
                if (response.ok) {
                    const jsonData = await response.json();
                    this.clients = jsonData.map(item => ({
                        id: item.companyid.toString(),
                        companyid: item.companyid.toString(),
                        name: item.companyName,
                        dbname: item.dbname,
                        landingurl: item.landingurl,
                        liveserverip: item.liveserverip || '',
                        applicationname: 'Employee Camera Hours',
                        applandingurl: item.applandingurl || item.landingurl,
                        username: item.userid || '',
                        password: item.password || ''
                    }));
                    this.populateClientOptions();
                    this.showNotification(`Successfully loaded ${this.clients.length} companies from JSON file`, 'success');
                    this.hideSkeletonLoader();
                    this.showLoadingState(false);
                    this.updateLastUpdatedTime(); // Update timestamp after loading
                    return;
                }
            } catch (jsonError) {
                console.warn('⚠️ Could not load from JSON file, trying alternative sources...');
            }
            
            // Fallback: Check if data is available from window.companiesData
            if (typeof window.companiesData !== 'undefined' && window.companiesData.length > 0) {
                // Normalize window.companiesData to ensure all fields including liveserverip
                this.clients = window.companiesData.map(item => ({
                    id: item.id || item.companyid?.toString() || '',
                    companyid: item.companyid?.toString() || item.id?.toString() || '',
                    name: item.name || item.companyName || '',
                    dbname: item.dbname || '',
                    landingurl: item.landingurl || '',
                    liveserverip: item.liveserverip || '',
                    applicationname: item.applicationname || 'Employee Camera Hours',
                    applandingurl: item.applandingurl || item.landingurl || '',
                    username: item.username || item.userid || '',
                    password: item.password || ''
                }));
                this.populateClientOptions();
                this.showNotification(`Successfully loaded ${this.clients.length} companies`, 'success');
                this.hideSkeletonLoader();
                this.showLoadingState(false);
                this.updateLastUpdatedTime(); // Update timestamp after loading
                return;
            }
        
            // Final fallback: Wait briefly and try window.companiesData again
            const dataAvailable = await this.waitForDataAvailability();
        
            if (dataAvailable) {
                // Normalize window.companiesData to ensure all fields including liveserverip
                this.clients = window.companiesData.map(item => ({
                    id: item.id || item.companyid?.toString() || '',
                    companyid: item.companyid?.toString() || item.id?.toString() || '',
                    name: item.name || item.companyName || '',
                    dbname: item.dbname || '',
                    landingurl: item.landingurl || '',
                    liveserverip: item.liveserverip || '',
                    applicationname: item.applicationname || 'Employee Camera Hours',
                    applandingurl: item.applandingurl || item.landingurl || '',
                    username: item.username || item.userid || '',
                    password: item.password || ''
                }));
            } else {
                this.clients = [];
            }
            
            this.populateClientOptions();
            this.showNotification(`Successfully loaded ${this.clients.length} companies`, 'success');
            this.updateLastUpdatedTime(); // Update timestamp after loading
            
        } catch (error) {
            console.error('❌ Error loading clients:', error);
            this.showNotification('Failed to load clients', 'error');
        } finally {
            this.hideSkeletonLoader();
            this.showLoadingState(false);
        }
    }

    async waitForDataAvailability() {
        const maxWaitTime = 5000; // 5 seconds maximum wait
        const checkInterval = 50; // Check every 50ms for faster response
        let waitTime = 0;
        
        while (waitTime < maxWaitTime) {
            if (typeof window.companiesData !== 'undefined' && window.companiesData.length > 0) {
                return true;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waitTime += checkInterval;
        }
        
        return false;
    }

    populateClientOptions() {
        const optionsContainer = document.getElementById('clientOptions');
        optionsContainer.innerHTML = '';

        if (this.clients.length === 0) {
            optionsContainer.innerHTML = '<div class="no-clients">No clients available. Please load client data.</div>';
            return;
        }

        this.clients.forEach((client, index) => {
            const option = document.createElement('div');
            option.className = 'client-option';
            option.innerHTML = `
                <input type="checkbox" id="client-${client.id}" value="${client.id}" data-name="${client.name}">
                <label for="client-${client.id}">${client.name}</label>
            `;
            
            option.addEventListener('change', () => {
                this.updateSelectedClients();
            });
            
            optionsContainer.appendChild(option);
        });
        
        // Client options populated successfully
    }

    toggleClientDropdown() {
        const dropdown = document.getElementById('clientSelectDropdown');
        dropdown.classList.toggle('show');
        dropdown.classList.toggle('active');
    }

    filterClients(searchTerm) {
        const options = document.querySelectorAll('.client-option');
        options.forEach(option => {
            const label = option.querySelector('label').textContent.toLowerCase();
            const isVisible = label.includes(searchTerm.toLowerCase());
            option.style.display = isVisible ? 'block' : 'none';
        });
    }

    selectAllClients() {
        const checkboxes = document.querySelectorAll('.client-option input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        this.updateSelectedClients();
    }

    clearAllClients() {
        const checkboxes = document.querySelectorAll('.client-option input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.updateSelectedClients();
    }

    updateSelectedClients() {
        const selectedCheckboxes = document.querySelectorAll('.client-option input[type="checkbox"]:checked');
        const selectedClientsList = document.getElementById('selectedClientsList');
        const selectedCount = document.getElementById('selectedCount');
        
        selectedClientsList.innerHTML = '';
        
        if (selectedCheckboxes.length > 0) {
            selectedCount.textContent = `${selectedCheckboxes.length} selected`;
            selectedCount.style.display = 'inline';
            
            selectedCheckboxes.forEach(checkbox => {
                const clientName = checkbox.getAttribute('data-name');
                const clientDiv = document.createElement('div');
                clientDiv.className = 'selected-client';
                clientDiv.innerHTML = `
                    <span>${clientName}</span>
                    <button type="button" class="remove-client" data-id="${checkbox.value}">×</button>
                `;
                
                clientDiv.querySelector('.remove-client').addEventListener('click', () => {
                    checkbox.checked = false;
                    this.updateSelectedClients();
                });
                
                selectedClientsList.appendChild(clientDiv);
            });
        } else {
            selectedCount.style.display = 'none';
        }
        
        // Validate form after client selection changes
        this.validateForm();
    }

    validateForm() {
        const generateBtn = document.getElementById('generateReportBtn');
        if (!generateBtn) return;
        
        // Check if at least one client is selected (only mandatory field)
        const selectedClients = document.querySelectorAll('.client-option input[type="checkbox"]:checked');
        const hasClientSelected = selectedClients.length > 0;
        
        // Enable button only if client is selected and not currently loading
        const isValid = hasClientSelected && !this.isLoading;
        
        generateBtn.disabled = !isValid;
    }

    generateReport() {
        console.log('🔘 Generate Report button clicked');
        
        try {
            // Check if button is disabled
            const generateBtn = document.getElementById('generateReportBtn');
            if (generateBtn && generateBtn.disabled) {
                console.warn('⚠️ Generate Report button is disabled');
                this.showNotification('Please select at least one client to generate report', 'warning');
                return;
            }
            
            let selectedClients = [];
            try {
                selectedClients = this.getSelectedClients();
                console.log('📋 Selected clients:', selectedClients);
            } catch (error) {
                console.error('❌ Error getting selected clients:', error);
                this.showNotification(`Error: ${error.message}`, 'error');
                return;
            }
            
            if (selectedClients.length === 0) {
                this.showNotification('Please select at least one client with valid data (URL, LiveServerIP, DBName)', 'warning');
                return;
            }
            
            // Initialize client status tracker
            this.initializeClientStatusTracker(selectedClients);
            
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            
            console.log('📅 Dates - Start:', startDate, 'End:', endDate);
            
            const reportData = {
                clients: selectedClients,
                reportType: document.getElementById('reportTypeSelect').value || 'summary',
                reportName: document.getElementById('reportNameSelect').value || 'employee-camera-hours',
                startDate: startDate,
                endDate: endDate
            };
            
            console.log('📊 Report data:', reportData);
            
            this.showNotification('Report generation started!', 'success');
            this.triggerAutomation(reportData);
        } catch (error) {
            console.error('❌ Error in generateReport:', error);
            this.showNotification(`Error generating report: ${error.message}`, 'error');
        }
    }
    
    initializeClientStatusTracker(clients) {
        const tracker = document.getElementById('clientStatusTracker');
        const statusList = document.getElementById('clientStatusList');
        const statusSummary = document.getElementById('statusSummary');
        
        if (!tracker || !statusList) return;
        
        // Clear previous status
        statusList.innerHTML = '';
        
        // Initialize extraction tracking
        if (!this.extractionStatus) {
            this.extractionStatus = {};
        }
        
        // Initialize status for each client
        clients.forEach(client => {
            const clientId = client.id || client.companyid;
            // Initialize extraction tracking for this client
            this.extractionStatus[clientId] = {
                portal_extracted: false,
                db_extracted: false
            };
            
            const statusItem = document.createElement('div');
            statusItem.className = 'client-status-item';
            statusItem.id = `status-${clientId}`;
            statusItem.dataset.clientId = clientId;
            statusItem.dataset.status = 'waiting';
            statusItem.innerHTML = `
                <div class="status-indicator-wrapper">
                    <span class="status-dot status-waiting"></span>
                </div>
                <div class="status-client-info">
                    <div class="status-client-name">${client.name}</div>
                    <div class="status-message">Waiting in queue...</div>
                </div>
                <div class="status-actions">
                    <button class="download-btn" id="download-${clientId}" disabled title="Download comparison Excel file">
                        <span>📥</span> Download
                    </button>
                    <button class="compare-btn" id="compare-${clientId}" style="display: none;" title="Compare DB vs Portal data">
                        <span>🔍</span> Compare
                    </button>
                </div>
            `;
            statusList.appendChild(statusItem);
            
            // Add event listeners
            const downloadBtn = document.getElementById(`download-${clientId}`);
            const compareBtn = document.getElementById(`compare-${clientId}`);
            
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => this.downloadComparison(clientId, client.name));
            }
            if (compareBtn) {
                compareBtn.addEventListener('click', () => this.triggerComparison(clientId, client.name));
            }
        });
        
        // Show tracker and update summary
        tracker.style.display = 'block';
        this.updateStatusSummary();
    }
    
    updateClientStatus(clientId, status, message = '') {
        const statusItem = document.getElementById(`status-${clientId}`);
        if (!statusItem) return;
        
        const statusDot = statusItem.querySelector('.status-dot');
        const statusMessage = statusItem.querySelector('.status-message');
        const downloadBtn = document.getElementById(`download-${clientId}`);
        const compareBtn = document.getElementById(`compare-${clientId}`);
        
        // Remove all status classes
        statusDot.className = 'status-dot';
        statusItem.dataset.status = status;
        
        // Add appropriate status class
        switch(status) {
            case 'processing':
                statusDot.classList.add('status-processing');
                statusMessage.textContent = message || 'Processing...';
                if (downloadBtn) downloadBtn.disabled = true;
                if (compareBtn) compareBtn.style.display = 'none';
                break;
            case 'completed':
            case 'success':
                statusDot.classList.add('status-completed');
                statusMessage.textContent = message || 'Completed';
                // Show compare button when test completes
                if (compareBtn) {
                    compareBtn.style.display = 'inline-flex';
                    compareBtn.disabled = false;
                }
                if (downloadBtn) downloadBtn.disabled = true;
                // Don't auto-trigger comparison here - wait for both extractions
                break;
            case 'comparison_ready':
                statusDot.classList.add('status-completed');
                statusMessage.textContent = message || 'Comparison ready';
                if (downloadBtn) {
                    downloadBtn.disabled = false;
                    downloadBtn.style.display = 'inline-flex';
                }
                if (compareBtn) compareBtn.style.display = 'none';
                break;
            case 'comparing':
                statusDot.classList.add('status-processing');
                statusMessage.textContent = message || 'Comparing data...';
                if (downloadBtn) downloadBtn.disabled = true;
                if (compareBtn) compareBtn.disabled = true;
                break;
            case 'failed':
            case 'error':
                statusDot.classList.add('status-failed');
                statusMessage.textContent = message || 'Failed';
                if (downloadBtn) downloadBtn.disabled = true;
                if (compareBtn) compareBtn.style.display = 'none';
                break;
            case 'waiting':
            default:
                statusDot.classList.add('status-waiting');
                statusMessage.textContent = message || 'Waiting in queue...';
                break;
        }
        
        this.updateStatusSummary();
    }
    
    updateStatusSummary() {
        const statusSummary = document.getElementById('statusSummary');
        if (!statusSummary) return;
        
        const items = document.querySelectorAll('.client-status-item');
        const total = items.length;
        let completed = 0;
        let failed = 0;
        let processing = 0;
        let waiting = 0;
        
        items.forEach(item => {
            const status = item.dataset.status;
            if (status === 'completed' || status === 'success' || status === 'comparison_ready') completed++;
            else if (status === 'failed' || status === 'error') failed++;
            else if (status === 'processing' || status === 'comparing') processing++;
            else waiting++;
        });
        
        statusSummary.textContent = `${completed}/${total} completed`;
    }
    
    async triggerComparison(clientId, clientName) {
        try {
            console.log(`🔍 Triggering comparison for ${clientName} (ID: ${clientId})`);
            this.updateClientStatus(clientId, 'comparing', 'Comparing DB vs Portal data...');
            
            // First check if server is running
            try {
                const healthCheck = await fetch('http://localhost:3010/health', { method: 'GET' });
                if (!healthCheck.ok) {
                    throw new Error('Server health check failed');
                }
            } catch (healthError) {
                console.error('❌ Server is not responding. Please ensure the server is running on http://localhost:3010');
                this.updateClientStatus(clientId, 'failed', 'Server not responding. Please restart the server.');
                this.showNotification('Server is not responding. Please ensure playwright-server.js is running on port 3010.', 'error');
                return;
            }
            
            const response = await fetch('http://localhost:3010/compare-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    clientId: clientId,
                    clientName: clientName
                })
            });
            
            // Check if response is JSON before parsing
            const contentType = response.headers.get('content-type');
            let result;
            
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                // Response is not JSON (likely HTML error page)
                const text = await response.text();
                console.error(`❌ Server returned non-JSON response (${response.status}):`, text.substring(0, 200));
                console.error(`❌ Full response URL: ${response.url}`);
                console.error(`❌ Response headers:`, Object.fromEntries(response.headers.entries()));
                
                if (response.status === 404) {
                    throw new Error(`Route not found. The server may need to be restarted. Please restart playwright-server.js`);
                } else {
                    throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
                }
            }
            
            if (result.status === 'success') {
                console.log(`✅ Comparison completed for ${clientName}:`, result.stats);
                this.updateClientStatus(clientId, 'comparison_ready', 
                    `Comparison ready (${result.stats.differences} differences found)`);
                this.showNotification(`Comparison completed for ${clientName}. ${result.stats.differences} differences found.`, 'success');
            } else {
                console.error(`❌ Comparison failed for ${clientName}:`, result.message);
                this.updateClientStatus(clientId, 'failed', `Comparison failed: ${result.message}`);
                this.showNotification(`Comparison failed for ${clientName}: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error(`❌ Error triggering comparison for ${clientName}:`, error);
            this.updateClientStatus(clientId, 'failed', `Comparison error: ${error.message}`);
            this.showNotification(`Error comparing data for ${clientName}: ${error.message}`, 'error');
        }
    }
    
    async downloadComparison(clientId, clientName) {
        try {
            console.log(`📥 Downloading comparison file for ${clientName} (ID: ${clientId})`);
            
            const response = await fetch(`http://localhost:3010/download-comparison/${clientId}`, {
                method: 'GET'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Download failed');
            }
            
            // Get filename from Content-Disposition header or use default
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `comparison-${clientId}.xlsx`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            // Create blob and download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            console.log(`✅ Download completed for ${clientName}`);
            this.showNotification(`Comparison file downloaded for ${clientName}`, 'success');
        } catch (error) {
            console.error(`❌ Error downloading comparison for ${clientName}:`, error);
            this.showNotification(`Error downloading comparison for ${clientName}: ${error.message}`, 'error');
        }
    }


    async triggerAutomation(reportData) {
        try {
            this.showNotification('🎭 Running Playwright tests...', 'info');
            
            const preview = document.getElementById('reportPreview');
            const content = document.getElementById('previewContent');
            
            if (preview && content) {
                content.innerHTML = `
                    <div class="preview-section">
                        <h4>🎭 Running Playwright Tests</h4>
                        <div class="playwright-command">
                            <p>🚀 Executing: <code>npx playwright test</code></p>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: 0%"></div>
                            </div>
                            <p class="progress-text">Starting Playwright tests...</p>
                        </div>
                        <!-- Console output is now in a separate section -->
                    </div>
                `;
                preview.style.display = 'block';
            }
            
            // Show console and progress sections
            const consoleSection = document.getElementById('consoleSection');
            const progressSection = document.getElementById('progressSection');
            
            if (consoleSection) {
                consoleSection.style.display = 'block';
                this.clearConsole();
                this.updateConsoleStatus('active');
            }
            
            if (progressSection) {
                progressSection.style.display = 'block';
            }
            
            // Update all clients to processing initially
            const selectedClients = this.getSelectedClients();
            selectedClients.forEach(client => {
                this.updateClientStatus(client.id || client.companyid, 'processing', 'Starting test...');
            });
            
            await this.executePlaywrightCommand();
        } catch (error) {
            console.error('❌ Playwright command error:', error);
            this.showNotification(`❌ Playwright error: ${error.message}`, 'error');
        }
    }

    async checkServerHealth() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const response = await fetch('http://localhost:3010/health', {
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const health = await response.json();
                return { available: true, running: health.running, dbUpdateRunning: health.dbUpdateRunning };
            }
            return { available: false, error: `Server responded with ${response.status}` };
        } catch (error) {
            if (error.name === 'AbortError') {
                return { available: false, error: 'Server health check timed out (5 seconds)' };
            }
            return { available: false, error: error.message };
        }
    }

    async executePlaywrightCommand() {
        try {
            // Update progress
            this.updateTestingProgress(0, 100, 'Checking server status...');
            
            // First, check if server is running
            this.updateConsoleOutput('🔍 Checking if Playwright server is running...\n', false);
            const healthCheck = await this.checkServerHealth();
            
            if (!healthCheck.available) {
                const errorMsg = `❌ Playwright server is not available: ${healthCheck.error}\n`;
                this.updateConsoleOutput(errorMsg, true);
                this.updateConsoleOutput('💡 Please start the server by running: node playwright-server.js\n', false);
                this.showNotification('❌ Server not available. Please start the Playwright server.', 'error');
                this.updateTestingProgress(0, 100, 'Server not available');
                return;
            }
            
            if (healthCheck.running) {
                const errorMsg = '⚠️ Tests are already running on the server\n';
                this.updateConsoleOutput(errorMsg, true);
                this.showNotification('⚠️ Tests are already running. Please wait for the current test to complete.', 'warning');
                this.updateTestingProgress(0, 100, 'Tests already running');
                return;
            }
            
            this.updateConsoleOutput('✅ Server is available and ready\n', false);
            
            // Get selected clients
            const selectedClients = this.getSelectedClients();
            
            if (selectedClients.length === 0) {
                throw new Error('No clients selected for testing');
            }
            
            // Get dates from UI
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            
            // Try to connect to the Playwright server
            this.updateTestingProgress(20, 100, 'Starting Playwright tests...');
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for the request
                
                const response = await fetch('http://localhost:3010/run-tests', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // 'x-run-token': 'your-secret-token' // Uncomment if using token auth
                    },
                    body: JSON.stringify({
                        clients: selectedClients,
                        startDate: startDate,
                        endDate: endDate
                    }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMessage = errorData.error || `Server responded with ${response.status}`;
                    
                    // Handle 409 Conflict - tests already running
                    if (response.status === 409) {
                        console.error('⚠️ Tests are already running on the server');
                        this.showNotification('⚠️ Tests are already running. Please wait for the current test to complete.', 'warning');
                        this.updateConsoleOutput(`\n⚠️ Error: ${errorMessage}\n`, true);
                        this.updateConsoleOutput('💡 Please wait for the current test to finish before starting a new one.\n', false);
                        return; // Don't fall back to simulation, just return
                    }
                    
                    throw new Error(errorMessage);
                }
                
                const result = await response.json();
                
                if (result.status === 'started') {
                    this.connectToSSE();
                } else {
                    throw new Error('Unexpected server response');
                }
            } catch (serverError) {
                if (serverError.name === 'AbortError') {
                    this.updateConsoleOutput('❌ Request timed out after 10 seconds\n', true);
                    this.updateConsoleOutput('💡 The server may be overloaded or not responding. Please check the server logs.\n', false);
                    this.showNotification('❌ Request timed out. Check server status.', 'error');
                    this.updateTestingProgress(0, 100, 'Request timed out');
                    return;
                }
                if (serverError.message.includes('409') || serverError.message.includes('Tests already running')) {
                    return;
                }
                if (serverError.message.includes('Failed to fetch') || serverError.message.includes('NetworkError')) {
                    this.updateConsoleOutput('❌ Cannot connect to server. Is it running?\n', true);
                    this.updateConsoleOutput('💡 Start the server with: node playwright-server.js\n', false);
                this.showNotification('❌ Server not available. Please start the server.', 'error');
                } else {
                    this.updateConsoleOutput(`❌ Error: ${serverError.message}\n`, true);
                    this.showNotification(`❌ Error: ${serverError.message}`, 'error');
                }
            }

        } catch (error) {
            console.error('❌ Error executing Playwright command:', error);
            this.updateConsoleOutput(`❌ Error: ${error.message}\n`, true);
            this.showNotification(`❌ Error: ${error.message}`, 'error');
            throw error;
        }
    }

    connectToSSE() {
        try {
            const eventSource = new EventSource('http://localhost:3010/events');
            
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    switch (data.type) {
                        case 'stdout':
                        case 'stderr':
                            this.updateConsoleOutput(data.text);
                            // Parse client status from console output
                            this.parseClientStatusFromOutput(data.text);
                break;
                        case 'info':
                            this.updateConsoleOutput(data.text);
                            this.parseClientStatusFromOutput(data.text);
                break;
                        case 'report-data':
                            this.displayReportData(data);
                break;
                        case 'exit':
                            this.updateTestingProgress(100, 100, 'Playwright tests completed!');
                            this.updateConsoleStatus('ready');
                            this.showNotification('🎭 Playwright tests completed!', 'success');
                            eventSource.close();
                break;
                        case 'error':
                            this.updateConsoleOutput(data.text, true);
                            this.parseClientStatusFromOutput(data.text, true);
                            this.showNotification(`❌ Playwright error: ${data.text}`, 'error');
                            eventSource.close();
                break;
                    }
                } catch (parseError) {
                    console.error('Error parsing SSE data:', parseError);
                }
            };
            
            eventSource.onerror = (error) => {
                console.error('SSE connection error:', error);
                this.showNotification('❌ Connection to server lost', 'error');
                eventSource.close();
            };
            
        } catch (error) {
            console.error('❌ Error connecting to SSE:', error);
            this.showNotification('❌ Failed to connect to server', 'error');
        }
    }

    displayReportData(data) {
        try {
            const { clientName, reportData, timestamp } = data;
            
            if (!reportData || !reportData.rows || reportData.rows.length === 0) {
                console.log('No report data to display');
                return;
            }
            
            // Show the report data section
            const reportDataSection = document.getElementById('reportDataSection');
            if (reportDataSection) {
                reportDataSection.style.display = 'block';
                
                // Scroll to the section
                reportDataSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            
            // Update info
            const reportDataInfo = document.getElementById('reportDataInfo');
            if (reportDataInfo) {
                const date = new Date(timestamp).toLocaleString();
                reportDataInfo.innerHTML = `
                    <div class="report-data-meta">
                        <strong>Client:</strong> ${clientName} | 
                        <strong>Rows:</strong> ${reportData.rowCount} | 
                        <strong>Time:</strong> ${date}
                    </div>
                `;
            }
            
            // Build table header
            const tableHead = document.getElementById('reportDataTableHead');
            if (tableHead && reportData.headers && reportData.headers.length > 0) {
                tableHead.innerHTML = '';
                const headerRow = document.createElement('tr');
                reportData.headers.forEach(header => {
                    const th = document.createElement('th');
                    th.textContent = header || '';
                    headerRow.appendChild(th);
                });
                tableHead.appendChild(headerRow);
            }
            
            // Build table body
            const tableBody = document.getElementById('reportDataTableBody');
            if (tableBody && reportData.rows) {
                tableBody.innerHTML = '';
                reportData.rows.forEach(row => {
                    const tr = document.createElement('tr');
                    reportData.headers.forEach(header => {
                        const td = document.createElement('td');
                        td.textContent = row[header] || '';
                        tr.appendChild(td);
                    });
                    tableBody.appendChild(tr);
                });
            }
            
            this.showNotification(`📊 Report data loaded for ${clientName}: ${reportData.rowCount} rows`, 'success');
            
            // Read all column data from the displayed table immediately
            this.readTableData();
            
        } catch (error) {
            console.error('Error displaying report data:', error);
            this.showNotification('❌ Error displaying report data', 'error');
        }
    }

    readTableData() {
        try {
            const table = document.getElementById('reportDataTable');
            if (!table) {
                console.warn('Table not found');
                return;
            }

            // Get all header columns
            const headerRow = table.querySelector('thead tr');
            if (!headerRow) {
                console.warn('Table header not found');
                return;
            }

            const headers = Array.from(headerRow.querySelectorAll('th')).map(th => th.textContent.trim());
            console.log('📋 Table Headers:', headers);

            // Get all data rows
            const dataRows = table.querySelectorAll('tbody tr');
            const allTableData = [];

            dataRows.forEach((row, rowIndex) => {
                const cells = Array.from(row.querySelectorAll('td'));
                const rowData = {};

                headers.forEach((header, colIndex) => {
                    const cellValue = cells[colIndex] ? cells[colIndex].textContent.trim() : '';
                    rowData[header] = cellValue;
                });

                allTableData.push(rowData);
            });

            console.log(`📊 Total Rows Read: ${allTableData.length}`);
            console.log('📋 All Table Data:', allTableData);

            // Store the data for potential use
            this.tableData = {
                headers: headers,
                rows: allTableData,
                rowCount: allTableData.length,
                columnCount: headers.length
            };

            // Display summary in console
            console.log('✅ Table Data Summary:', {
                columns: headers,
                totalRows: allTableData.length,
                totalColumns: headers.length
            });

            // Show notification with data summary
            this.showNotification(
                `✅ Table data read: ${allTableData.length} rows × ${headers.length} columns`,
                'success'
            );

            return this.tableData;

        } catch (error) {
            console.error('❌ Error reading table data:', error);
            this.showNotification('❌ Error reading table data', 'error');
            return null;
        }
    }


    updateConsoleOutput(message, isError = false) {
        const outputBox = document.getElementById('playwrightOutput');
        const consoleSection = document.getElementById('consoleSection');
        
        if (outputBox) {
            // Remove welcome message if present
            const welcome = outputBox.querySelector('.console-welcome');
            if (welcome) {
                welcome.remove();
            }
            
            // Show console section if hidden
            if (consoleSection && consoleSection.style.display === 'none') {
                consoleSection.style.display = 'block';
            }
            
            const messageElement = document.createElement('div');
            messageElement.className = 'console-message';
            
            // Determine message type and apply appropriate class
            const trimmedMessage = message.trim();
            if (isError || trimmedMessage.includes('❌') || trimmedMessage.includes('ERROR')) {
                messageElement.className += ' error';
            } else if (trimmedMessage.includes('✅') || trimmedMessage.includes('SUCCESS')) {
                messageElement.className += ' success';
            } else if (trimmedMessage.includes('⚠️') || trimmedMessage.includes('WARNING')) {
                messageElement.className += ' warning';
            } else if (trimmedMessage.includes('ℹ️') || trimmedMessage.includes('INFO')) {
                messageElement.className += ' info';
            }
            
            messageElement.textContent = trimmedMessage;
            
            outputBox.appendChild(messageElement);
            
            // Auto-scroll to bottom
            outputBox.scrollTop = outputBox.scrollHeight;
            
            // Update console status
            this.updateConsoleStatus(isError ? 'error' : 'active');
        }
    }
    
    updateConsoleStatus(status) {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.querySelector('.status-text');
        
        if (statusIndicator && statusText) {
            statusIndicator.className = 'status-indicator';
            
            switch(status) {
                case 'active':
                    statusIndicator.classList.add('waiting');
                    statusText.textContent = 'Running...';
                    break;
                case 'error':
                    statusIndicator.classList.add('error');
                    statusText.textContent = 'Error';
                    break;
                case 'ready':
                default:
                    statusText.textContent = 'Ready';
                    break;
            }
        }
    }
    
    clearConsole() {
        const outputBox = document.getElementById('playwrightOutput');
        if (outputBox) {
            outputBox.innerHTML = '<div class="console-welcome"><p>📋 Console output will appear here when tests are running...</p></div>';
            this.updateConsoleStatus('ready');
        }
    }
    
    scrollConsoleToBottom() {
        const outputBox = document.getElementById('playwrightOutput');
        if (outputBox) {
            outputBox.scrollTop = outputBox.scrollHeight;
        }
    }
    
    parseClientStatusFromOutput(text, isError = false) {
        // Parse client status from console output
        // Look for patterns like "Client Name: Test completed" or "Client Name: Error"
        const selectedClients = this.getSelectedClients();
        
        // Initialize extraction status if not exists
        if (!this.extractionStatus) {
            this.extractionStatus = {};
        }
        
        // Try to match client names in the output
        selectedClients.forEach(client => {
            const clientName = client.name;
            const clientId = client.id || client.companyid;
            
            // Initialize extraction tracking for this client if not exists
            if (!this.extractionStatus[clientId]) {
                this.extractionStatus[clientId] = {
                    portal_extracted: false,
                    db_extracted: false
                };
            }
            
            // Check for various status patterns
            if (text.includes(clientName)) {
                // Check for portal extraction completion
                if (text.includes('Portal data extracted') || text.includes('Report data extracted') || 
                    (text.includes('✅') && text.includes('rows extracted') && !text.includes('ECH query'))) {
                    this.extractionStatus[clientId].portal_extracted = true;
                    console.log(`✅ Portal extraction completed for ${clientName}`);
                }
                
                // Check for DB extraction completion (success, skipped, or failed - all count as "done")
                if (text.includes('ECH query completed') || text.includes('ECH query completed and saved') || 
                    text.includes('DB data extracted successfully') || text.includes('DB extraction skipped') ||
                    text.includes('DB extraction attempt completed')) {
                    this.extractionStatus[clientId].db_extracted = true;
                    console.log(`✅ DB extraction completed for ${clientName}`);
                }
                
                // Check if both extractions are complete
                if (this.extractionStatus[clientId].portal_extracted && this.extractionStatus[clientId].db_extracted) {
                    // Both extractions complete - trigger comparison
                    console.log(`✅ Both extractions complete for ${clientName}, triggering comparison...`);
                    setTimeout(() => {
                        this.triggerComparison(clientId, clientName);
                    }, 1000);
                }
                
                if (isError || text.includes('❌') || text.includes('Failed') || text.includes('Error') || text.includes('failed')) {
                    this.updateClientStatus(clientId, 'failed', text.match(new RegExp(`${clientName}[^\\n]*`, 'i'))?.[0] || 'Test failed');
                } else if (text.includes('✅') || text.includes('completed') || text.includes('Completed')) {
                    // Only mark as completed if we haven't already triggered comparison
                    if (!this.extractionStatus[clientId].portal_extracted || !this.extractionStatus[clientId].db_extracted) {
                        this.updateClientStatus(clientId, 'processing', 
                            `Extracting data... (Portal: ${this.extractionStatus[clientId].portal_extracted ? '✓' : '⏳'}, DB: ${this.extractionStatus[clientId].db_extracted ? '✓' : '⏳'})`);
                    }
                } else if (text.includes('🔄') || text.includes('Starting') || text.includes('Processing') || text.includes('Executing')) {
                    this.updateClientStatus(clientId, 'processing', text.match(new RegExp(`${clientName}[^\\n]*`, 'i'))?.[0] || 'Processing...');
                }
            }
        });
    }



    updateTestingProgress(current, total, message) {
        const progressBar = document.getElementById('progressFill') || document.querySelector('.progress-fill');
        const progressText = document.getElementById('progressText') || document.querySelector('.progress-text');
        const progressPercentage = document.getElementById('progressPercentage');
        const progressSection = document.getElementById('progressSection');
        
        const percentage = (current / total) * 100;
        
        // Show progress section if hidden
        if (progressSection && progressSection.style.display === 'none') {
            progressSection.style.display = 'block';
        }
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = message;
        }
        
        if (progressPercentage) {
            progressPercentage.textContent = `${Math.round(percentage)}%`;
        }
    }

    clearForm() {
        document.getElementById('clientSelectDropdown').classList.remove('show', 'active');
        document.getElementById('clientSearch').value = '';
        document.querySelectorAll('.client-option input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Reset to defaults
        this.setDefaultReportOptions();
        this.setDefaultDates();
        
        // Hide preview sections
        const reportPreview = document.getElementById('reportPreview');
        const consoleSection = document.getElementById('consoleSection');
        const progressSection = document.getElementById('progressSection');
        const resultsSection = document.getElementById('resultsSection');
        const clientStatusTracker = document.getElementById('clientStatusTracker');
        
        if (reportPreview) reportPreview.style.display = 'none';
        if (consoleSection) consoleSection.style.display = 'none';
        if (progressSection) progressSection.style.display = 'none';
        if (resultsSection) resultsSection.style.display = 'none';
        if (clientStatusTracker) clientStatusTracker.style.display = 'none';
        
        this.updateSelectedClients();
        this.validateForm(); // This will disable the button after clearing
        this.showNotification('Form reset to defaults!', 'success');
    }

    showLoadingState(isLoading) {
        this.isLoading = isLoading;
        const generateBtn = document.getElementById('generateReportBtn');
        if (isLoading) {
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<span class="button-icon">⏳</span>Loading...';
        } else {
            generateBtn.innerHTML = '<span class="button-icon">📊</span>Generate Report';
        }
    }

    showSkeletonLoader() {
        const optionsContainer = document.getElementById('clientOptions');
        optionsContainer.innerHTML = `
            <div class="skeleton-loader">
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="loading-message">
                    <div class="spinner"></div>
                    <span>Loading client data...</span>
                </div>
            </div>
        `;
    }

    hideSkeletonLoader() {
        // The skeleton loader will be replaced by populateClientOptions()
        // This method exists to prevent errors when called
        // The actual clearing happens when populateClientOptions() sets the innerHTML
    }

    updateLastUpdatedTime() {
        const now = new Date();
        const timestamp = now.toISOString();
        const todayKey = this.getTodayKey();
        
        // Store latest timestamp
        localStorage.setItem('lastUpdatedTimestamp', timestamp);
        
        // Store today's latest update time
        localStorage.setItem(`lastUpdated_${todayKey}`, timestamp);
        
        // Update display
        this.displayLastUpdatedTime(now);
    }
    
    getTodayKey() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    loadLastUpdatedTime() {
        const todayKey = this.getTodayKey();
        const todayTimestamp = localStorage.getItem(`lastUpdated_${todayKey}`);
        
        // Prefer today's latest update if available
        if (todayTimestamp) {
            const lastUpdated = new Date(todayTimestamp);
            this.displayLastUpdatedTime(lastUpdated);
        } else {
            // Fall back to general timestamp
            const timestamp = localStorage.getItem('lastUpdatedTimestamp');
            if (timestamp) {
                const lastUpdated = new Date(timestamp);
                this.displayLastUpdatedTime(lastUpdated);
            } else {
                // If no timestamp exists, set current time
                this.updateLastUpdatedTime();
            }
        }
    }

    displayLastUpdatedTime(date) {
        const lastUpdatedTimeElement = document.getElementById('lastUpdatedTime');
        if (!lastUpdatedTimeElement) return;
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const updateDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        // Check if the update was today
        const isToday = updateDate.getTime() === today.getTime();
        
        let formattedDate;
        
        if (isToday) {
            // Show "Today at [time]"
            const timeStr = date.toLocaleString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            formattedDate = `Today at ${timeStr}`;
        } else {
            // Show full date with time for previous days
            const dateStr = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const timeStr = date.toLocaleString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            formattedDate = `${dateStr} at ${timeStr}`;
        }
        
        lastUpdatedTimeElement.textContent = formattedDate;
        
        // Add a visual indicator if it's today's latest update
        if (isToday) {
            lastUpdatedTimeElement.classList.add('today-update');
        } else {
            lastUpdatedTimeElement.classList.remove('today-update');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }


    getSelectedClients() {
        const selectedCheckboxes = document.querySelectorAll('.client-option input[type="checkbox"]:checked');
        const clients = Array.from(selectedCheckboxes).map(checkbox => {
            const clientName = checkbox.getAttribute('data-name');
            const clientId = checkbox.value;
            
            // Find the full client data from window.companiesData
            const fullClientData = this.findClientData(clientName);
            
            return {
                id: clientId,
                name: clientName,
                companyid: fullClientData ? (fullClientData.companyid || fullClientData.id) : clientId,
                applandingurl: fullClientData ? fullClientData.applandingurl : '',
                dbname: fullClientData ? fullClientData.dbname : '',
                liveserverip: fullClientData ? (fullClientData.liveserverip || '') : '',
                username: fullClientData ? fullClientData.username : '',
                password: fullClientData ? fullClientData.password : ''
            };
        });
        
        // Filter out clients without valid URLs and required fields, show warnings
        const validClients = clients.filter(client => {
            if (!client.applandingurl || client.applandingurl.trim() === '') {
                this.showNotification(`⚠️ Client "${client.name}" has no URL - skipping`, 'warning');
                return false;
            }
            if (!client.liveserverip || client.liveserverip.trim() === '') {
                this.showNotification(`⚠️ Client "${client.name}" has no LiveServerIP - skipping. Please refresh the page to reload client data.`, 'warning');
                console.error(`❌ Client "${client.name}" missing liveserverip. Full client data:`, client);
                return false;
            }
            if (!client.dbname || client.dbname.trim() === '') {
                this.showNotification(`⚠️ Client "${client.name}" has no database name - skipping`, 'warning');
                return false;
            }
            return true;
        });
        
        if (validClients.length === 0 && clients.length > 0) {
            console.warn('⚠️ No valid clients found. Selected clients:', clients);
            // Don't throw error, just return empty array and let generateReport handle it
            return [];
        }
        
        return validClients;
    }

    findClientData(clientName) {
        // Find client data from this.clients (loaded from JSON or embedded data)
        if (this.clients && Array.isArray(this.clients)) {
            const found = this.clients.find(client => 
                client.name === clientName || 
                client.name.toLowerCase() === clientName.toLowerCase()
            );
            if (found) {
                return found;
            }
        }
        // Fallback to window.companiesData if this.clients is not available
        if (window.companiesData && Array.isArray(window.companiesData)) {
            const found = window.companiesData.find(client => 
                client.name === clientName || 
                client.name.toLowerCase() === clientName.toLowerCase()
            );
            if (found) {
                return found;
        }
        }
        
        return null;
    }

    setupLogsModal() {
        const closeBtn = document.getElementById('closeLogsModal');
        const modal = document.getElementById('logsModal');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeLogsModal();
            });
        }
        
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeLogsModal();
                }
            });
        }
    }

    async openLogsModal() {
        const modal = document.getElementById('logsModal');
        if (modal) {
            modal.style.display = 'flex';
            await this.loadLogs();
        }
    }

    closeLogsModal() {
        const modal = document.getElementById('logsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async loadLogs() {
        const loadingEl = document.getElementById('logsLoading');
        const listEl = document.getElementById('logsList');
        const emptyEl = document.getElementById('logsEmpty');
        
        try {
            loadingEl.style.display = 'block';
            listEl.style.display = 'none';
            emptyEl.style.display = 'none';
            
            const response = await fetch('http://localhost:3010/logs');
            if (!response.ok) {
                throw new Error('Failed to load logs');
            }
            
            const data = await response.json();
            loadingEl.style.display = 'none';
            
            if (!data.logs || data.logs.length === 0) {
                emptyEl.style.display = 'block';
                return;
            }
            
            this.renderLogs(data.logs);
            listEl.style.display = 'block';
            
        } catch (error) {
            console.error('Error loading logs:', error);
            loadingEl.style.display = 'none';
            listEl.innerHTML = `<div class="logs-error">Error loading logs: ${error.message}</div>`;
            listEl.style.display = 'block';
        }
    }

    renderLogs(logs) {
        const listEl = document.getElementById('logsList');
        if (!listEl) return;
        
        listEl.innerHTML = logs.map(log => {
            const timestamp = new Date(log.timestamp).toLocaleString();
            const statusClass = log.status === 'success' ? 'status-success' : 'status-failed';
            const statusText = log.status === 'success' ? '✅ Passed' : '❌ Failed';
            
            const differencesSummary = log.differencesCount > 0 
                ? `${log.differencesCount} difference(s) found`
                : 'No differences';
            
            return `
                <div class="log-entry">
                    <div class="log-header">
                        <div class="log-client-name">${log.clientName || 'Unknown'}</div>
                        <div class="log-status ${statusClass}">${statusText}</div>
                    </div>
                    <div class="log-details">
                        <div class="log-timestamp">🕒 ${timestamp}</div>
                        <div class="log-stats">
                            <span>DB Records: ${log.totalDBRecords || 0}</span>
                            <span>Portal Records: ${log.totalPortalRecords || 0}</span>
                            <span>Matching: ${log.matchingCount || 0}</span>
                        </div>
                        <div class="log-differences">
                            <strong>Differences Summary:</strong> ${differencesSummary}
                            ${log.dbOnlyCount > 0 ? ` | DB Only: ${log.dbOnlyCount}` : ''}
                            ${log.portalOnlyCount > 0 ? ` | Portal Only: ${log.portalOnlyCount}` : ''}
                        </div>
                    </div>
                    <div class="log-actions">
                        <a href="http://localhost:3010/download-comparison/${log.clientId}" 
                           class="download-btn" 
                           download>
                            📥 Download Excel
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new EmployeeCameraHoursAuditDashboard();
});