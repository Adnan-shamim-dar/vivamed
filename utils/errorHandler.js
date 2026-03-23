/**
 * Standardized Error Handler
 * Consistent error responses across all endpoints
 */

/**
 * Express error handling middleware
 * Catches all errors and formats responses consistently
 */
function errorHandler(err, req, res, next) {
  console.error('❌ Error:', err.message);

  // AI Service errors
  if (err.message.includes('OPENROUTER') || err.message.includes('API') || err.message.includes('timeout')) {
    return res.status(503).json({
      success: false,
      error: 'AI service temporarily unavailable',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }

  // Database errors
  if (err.message.includes('database') || err.message.includes('SQLITE') || err.message.includes('FOREIGN KEY')) {
    return res.status(500).json({
      success: false,
      error: 'Database operation failed',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }

  // PDF processing errors
  if (err.message.includes('PDF') || err.message.includes('file')) {
    return res.status(400).json({
      success: false,
      error: 'File processing error',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }

  // Validation errors
  if (err.message.includes('Invalid') || err.message.includes('required')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
}

/**
 * Async route wrapper - catches promise rejections in routes
 * Use: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Format success response
 */
function successResponse(data, message = 'Success') {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format error response
 */
function errorResponse(message, error = null, statusCode = 400) {
  return {
    success: false,
    message,
    error: error ? error.message : null,
    statusCode,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  errorHandler,
  asyncHandler,
  successResponse,
  errorResponse
};
