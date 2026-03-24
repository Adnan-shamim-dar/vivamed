/**
 * RequestQueue - Offline Support System
 * Queues failed requests and auto-syncs when online
 * Prevents data loss on network disconnections
 */

class RequestQueue {
  constructor() {
    this.queue = [];
    this.isOnline = navigator.onLine;
    this.processInterval = null;
    this.storageKey = 'vivamed_request_queue';

    // Monitor online/offline status
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Load persisted queue from localStorage
    this.loadFromStorage();
  }

  /**
   * Add a request to the queue
   * Called when fetch fails and we're offline
   */
  async add(url, options = {}) {
    const request = {
      id: Date.now() + Math.random(),
      url,
      options,
      timestamp: new Date().toISOString(),
      retries: 0,
      maxRetries: 3
    };

    this.queue.push(request);
    this.saveToStorage();

    console.log(`📤 Request queued for offline: ${url}`, request.id);
    console.log(`📊 Queue size: ${this.queue.length} requests`);

    return request.id;
  }

  /**
   * Process all queued requests when online
   */
  async processQueue() {
    if (!this.isOnline || this.queue.length === 0) {
      return;
    }

    console.log(`🔄 Processing ${this.queue.length} queued requests...`);

    while (this.queue.length > 0) {
      const request = this.queue[0];

      try {
        console.log(`⏳ Processing request: ${request.url} (attempt ${request.retries + 1})`);

        const response = await fetch(request.url, request.options);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Success - remove from queue
        this.queue.shift();
        this.saveToStorage();
        console.log(`✅ Request succeeded and removed from queue`);

      } catch (error) {
        request.retries++;

        if (request.retries >= request.maxRetries) {
          // Max retries reached - remove from queue
          console.error(`❌ Request failed after ${request.maxRetries} retries, removing from queue:`, error.message);
          this.queue.shift();
        } else {
          // Wait before retrying
          const delay = Math.pow(2, request.retries) * 1000;
          console.warn(`⏳ Request failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        this.saveToStorage();
      }
    }

    if (this.queue.length === 0) {
      console.log(`✅ All queued requests processed!`);
    }
  }

  /**
   * Handle going online
   */
  handleOnline() {
    this.isOnline = true;
    console.log(`🟢 Online - processing ${this.queue.length} queued requests`);
    this.processQueue();
  }

  /**
   * Handle going offline
   */
  handleOffline() {
    this.isOnline = false;
    console.log(`🔴 Offline - requests will be queued and synced when online`);
  }

  /**
   * Save queue to localStorage for persistence across page reloads
   */
  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save request queue to storage:', error);
    }
  }

  /**
   * Load queue from localStorage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`📥 Loaded ${this.queue.length} requests from storage`);

        // Immediately process if online
        if (this.isOnline && this.queue.length > 0) {
          this.processQueue();
        }
      }
    } catch (error) {
      console.error('Failed to load request queue from storage:', error);
      this.queue = [];
    }
  }

  /**
   * Clear the queue
   */
  clear() {
    const count = this.queue.length;
    this.queue = [];
    localStorage.removeItem(this.storageKey);
    console.log(`🗑️  Request queue cleared (${count} items removed)`);
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      isOnline: this.isOnline,
      queueLength: this.queue.length,
      queue: this.queue.map(r => ({ url: r.url, retries: r.retries }))
    };
  }
}

// Export singleton instance
window.requestQueue = new RequestQueue();
console.log('✅ RequestQueue initialized');
