/**
 * Lightweight observable state management for MVVM pattern.
 * Provides reactive state with subscribe/unsubscribe capabilities.
 * 
 * Usage:
 *   const state = createObservable({ count: 0, name: 'test' });
 *   const unsub = state.subscribe((newState) => console.log(newState));
 *   state.set({ count: 1 }); // triggers subscriber with { count: 1, name: 'test' }
 *   state.set(prev => ({ count: prev.count + 1 })); // function updater
 *   unsub(); // cleanup
 */

export function createObservable(initialState = {}) {
  let state = { ...initialState };
  const subscribers = new Set();

  return {
    /**
     * Get current state (returns a shallow copy to prevent external mutation)
     */
    get() {
      return { ...state };
    },

    /**
     * Update state with partial update or updater function
     * @param {Object|Function} partial - Object to merge or function (prevState) => newPartial
     */
    set(partial) {
      if (typeof partial === 'function') {
        // Updater function: (prevState) => newPartial
        const newPartial = partial({ ...state });
        state = { ...state, ...newPartial };
      } else {
        // Direct partial merge
        state = { ...state, ...partial };
      }
      
      // Notify all subscribers with current state
      const currentState = { ...state };
      subscribers.forEach(callback => {
        try {
          callback(currentState);
        } catch (err) {
          console.error('[Observable] Subscriber error:', err);
        }
      });
    },

    /**
     * Subscribe to state changes
     * @param {Function} callback - Called with new state on each update
     * @returns {Function} unsubscribe function
     */
    subscribe(callback) {
      if (typeof callback !== 'function') {
        throw new Error('Subscriber must be a function');
      }
      subscribers.add(callback);
      
      // Return unsubscribe function
      return () => {
        subscribers.delete(callback);
      };
    },

    /**
     * Unsubscribe a callback
     * @param {Function} callback - The callback to remove
     */
    unsubscribe(callback) {
      subscribers.delete(callback);
    },

    /**
     * Get current subscriber count (useful for debugging)
     */
    getSubscriberCount() {
      return subscribers.size;
    }
  };
}
