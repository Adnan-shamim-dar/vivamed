/**
 * ErrorRecovery - Centralized Error Recovery Manager
 * Provides unified retry logic, fallbacks, and error handling
 * Replaces scattered try-catch blocks with consistent strategy
 */

class ErrorRecoveryManager {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
    this.configs = {
      default: {
        maxRetries: 3,
        baseDelay: 1000,
        backoffMultiplier: 2,
        timeout: 10000
      },
      fast: {
        maxRetries: 2,
        baseDelay: 500,
        backoffMultiplier: 1.5,
        timeout: 5000
      },
      slow: {
        maxRetries: 5,
        baseDelay: 2000,
        backoffMultiplier: 2,
        timeout: 20000
      }
    };
  }

  /**
   * Execute operation with automatic retry and fallback
   * @param {string} operationId - Unique ID for this operation
   * @param {Function} operation - Async function to execute
   * @param {Object} options - { configType, fallback, onRetry, onFail }
   */
  async executeWithRecovery(operationId, operation, options = {}) {
    const {
      configType = 'default',
      fallback = null,
      onRetry = null,
      onFail = null
    } = options;

    const config = this.configs[configType] || this.configs.default;
    let lastError;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        // Execute with timeout
        const result = await this.withTimeout(
          operation(),
          config.timeout
        );

        // Success!
        if (attempt > 1) {
          console.log(`✅ [${operationId}] Succeeded on attempt ${attempt}/${config.maxRetries}`);
        }
        this.logSuccess(operationId, attempt, config.maxRetries);
        return result;

      } catch (error) {
        lastError = error;
        this.logError(operationId, attempt, error, config.maxRetries);

        // Callback for retry attempts
        if (attempt < config.maxRetries && onRetry) {
          onRetry(attempt, config.maxRetries, error.message);
        }

        // Wait before next retry (exponential backoff)
        if (attempt < config.maxRetries) {
          const delay = config.baseDelay *
                        Math.pow(config.backoffMultiplier, attempt - 1);
          console.log(`⏳ [${operationId}] Retrying in ${delay}ms (attempt ${attempt}/${config.maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed - try fallback
    if (fallback) {
      try {
        console.warn(`🔄 [${operationId}] Using fallback after ${config.maxRetries} failures`);
        const fallbackResult = await fallback(lastError);
        this.logFallback(operationId, true);
        return fallbackResult;

      } catch (fallbackError) {
        console.error(`❌ [${operationId}] Fallback also failed:`, fallbackError.message);
        this.logFallback(operationId, false, fallbackError);

        if (onFail) {
          onFail(fallbackError, true); // true = fallback failed
        }

        throw new Error(`[${operationId}] All retries and fallback failed: ${fallbackError.message}`);
      }
    }

    // No fallback - throw the last error
    if (onFail) {
      onFail(lastError, false); // false = no fallback
    }

    throw new Error(`[${operationId}] Operation failed after ${config.maxRetries} retries: ${lastError.message}`);
  }

  /**
   * Execute operation with timeout
   */
  withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      )
    ]);
  }

  /**
   * Log successful operation (with retry details)
   */
  logSuccess(operationId, attemptNumber, maxRetries) {
    const log = {
      id: operationId,
      status: 'success',
      attempt: attemptNumber,
      maxRetries,
      timestamp: new Date().toISOString()
    };
    this.addToLog(log);
  }

  /**
   * Log failed operation attempt
   */
  logError(operationId, attemptNumber, error, maxRetries) {
    const log = {
      id: operationId,
      status: 'error',
      attempt: attemptNumber,
      maxRetries,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    this.addToLog(log);
    console.error(`❌ [${operationId}] Attempt ${attemptNumber}/${maxRetries} failed:`, error.message);
  }

  /**
   * Log fallback usage
   */
  logFallback(operationId, success, error = null) {
    const log = {
      id: operationId,
      status: success ? 'fallback_success' : 'fallback_failed',
      error: error ? error.message : null,
      timestamp: new Date().toISOString()
    };
    this.addToLog(log);
  }

  /**
   * Add log entry
   */
  addToLog(entry) {
    this.errorLog.push(entry);

    // Keep last 100 entries only
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }

  /**
   * Get error history
   */
  getErrorHistory(operationId = null) {
    if (operationId) {
      return this.errorLog.filter(e => e.id === operationId);
    }
    return this.errorLog.slice(-30); // Last 30 entries
  }

  /**
   * Get error statistics
   */
  getStats() {
    const stats = {
      total: this.errorLog.length,
      successes: this.errorLog.filter(e => e.status === 'success').length,
      failures: this.errorLog.filter(e => e.status === 'error').length,
      fallbacks: this.errorLog.filter(e => e.status.includes('fallback')).length,
      failureRate: 0
    };

    if (stats.total > 0) {
      stats.failureRate = Math.round((stats.failures / stats.total) * 100);
    }

    return stats;
  }

  /**
   * Clear error log
   */
  clearLog() {
    const count = this.errorLog.length;
    this.errorLog = [];
    console.log(`🗑️  Error log cleared (${count} entries)`);
  }
}

// Export singleton instance
window.errorRecovery = new ErrorRecoveryManager();
console.log('✅ ErrorRecoveryManager initialized');
