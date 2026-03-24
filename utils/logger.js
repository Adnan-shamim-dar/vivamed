/**
 * Logger - Enhanced Logging System
 * Provides detailed logging, metrics, and analytics
 * Helps identify and debug issues
 */

class Logger {
  constructor() {
    this.logs = [];
    this.maxLogSize = 500;
    this.metrics = {
      apiCalls: 0,
      errors: 0,
      warnings: 0,
      successes: 0,
      startTime: new Date()
    };

    console.log('✅ Logger initialized');
  }

  /**
   * Log API request
   */
  logRequest(url, method = 'GET', status = 'pending') {
    this.metrics.apiCalls++;
    const log = {
      type: 'api_request',
      url,
      method,
      status,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime()
    };
    this.addLog(log);

    if (status === 'success') {
      this.metrics.successes++;
      console.log(`📤 [${method}] ${url} ✅`);
    } else if (status === 'error') {
      this.metrics.errors++;
      console.error(`📤 [${method}] ${url} ❌`);
    }
  }

  /**
   * Log operation success
   */
  logSuccess(operationName, details = {}) {
    this.metrics.successes++;
    const log = {
      type: 'success',
      operation: operationName,
      details,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime()
    };
    this.addLog(log);
    console.log(`✅ ${operationName}`, details);
  }

  /**
   * Log errors
   */
  logError(operationName, error, severity = 'normal') {
    this.metrics.errors++;
    const log = {
      type: 'error',
      operation: operationName,
      severity,
      message: error?.message || String(error),
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime()
    };
    this.addLog(log);
    console.error(`❌ [${severity.toUpperCase()}] ${operationName}:`, error?.message || error);
  }

  /**
   * Log warnings
   */
  logWarning(message, details = {}) {
    this.metrics.warnings++;
    const log = {
      type: 'warning',
      message,
      details,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime()
    };
    this.addLog(log);
    console.warn(`⚠️  ${message}`, details);
  }

  /**
   * Log data change
   */
  logDataChange(dataType, action, before, after) {
    const log = {
      type: 'data_change',
      dataType,
      action, // 'create', 'update', 'delete'
      before,
      after,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime()
    };
    this.addLog(log);
    console.log(`📝 [${dataType}] ${action}:`, { before, after });
  }

  /**
   * Log performance metric
   */
  logPerformance(operationName, durationMs) {
    const log = {
      type: 'performance',
      operation: operationName,
      durationMs,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime()
    };
    this.addLog(log);

    if (durationMs > 5000) {
      console.warn(`⏱️  [SLOW] ${operationName} took ${durationMs}ms`);
    } else {
      console.log(`⏱️  ${operationName} took ${durationMs}ms`);
    }
  }

  /**
   * Log network status change
   */
  logNetworkStatus(isOnline) {
    const status = isOnline ? 'ONLINE' : 'OFFLINE';
    const log = {
      type: 'network_status',
      status,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime()
    };
    this.addLog(log);
    console.log(`🌐 Network status: ${status}`);
  }

  /**
   * Add log entry
   */
  addLog(entry) {
    this.logs.push(entry);

    // Keep last N entries
    if (this.logs.length > this.maxLogSize) {
      this.logs.shift();
    }
  }

  /**
   * Get logs by type
   */
  getLogsByType(type) {
    return this.logs.filter(log => log.type === type);
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count = 50) {
    return this.logs.slice(-count);
  }

  /**
   * Get error logs
   */
  getErrorLogs() {
    return this.getLogsByType('error');
  }

  /**
   * Get performance logs
   */
  getPerformanceLogs() {
    return this.getLogsByType('performance').filter(l => l.durationMs > 1000);
  }

  /**
   * Get uptime in seconds
   */
  getUptime() {
    return Math.round((new Date() - this.metrics.startTime) / 1000);
  }

  /**
   * Get metrics summary
   */
  getMetrics() {
    const errorRate = this.metrics.apiCalls > 0
      ? Math.round((this.metrics.errors / this.metrics.apiCalls) * 100)
      : 0;

    return {
      ...this.metrics,
      uptime: `${this.getUptime()}s`,
      errorRate: `${errorRate}%`,
      avgLogsPerSecond: Math.round(this.logs.length / (this.getUptime() || 1))
    };
  }

  /**
   * Export logs as JSON
   */
  exportLogs() {
    return {
      metrics: this.getMetrics(),
      logs: this.logs
    };
  }

  /**
   * Export logs as CSV for analysis
   */
  exportLogsAsCSV() {
    let csv = 'timestamp,type,operation,status,message\n';

    this.logs.forEach(log => {
      const row = [
        log.timestamp,
        log.type,
        log.operation || log.dataType || '',
        log.status || log.severity || '',
        (log.message || '').replace(/,/g, ';')
      ];
      csv += row.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Clear all logs
   */
   clearLogs() {
    const count = this.logs.length;
    this.logs = [];
    console.log(`🗑️  Logger cleared (${count} entries)`);
  }

  /**
   * Display summary in console
   */
  showSummary() {
    const metrics = this.getMetrics();
    console.table(metrics);
    console.log('📊 Recent logs:', this.getRecentLogs(5));
  }
}

// Export singleton instance
window.logger = new Logger();
console.log('✅ Logger initialized');
