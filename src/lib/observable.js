/**
 * Lightweight observable module for reactive state management in MVVM pattern.
 * 
 * Creates an observable object that notifies subscribers when state changes.
 * 
 * @param {Object} initialState - Initial state object
 * @returns {Object} Observable object with get, set, subscribe, unsubscribe methods
 * 
 * @example
 * const state = createObservable({ count: 0, name: 'test' });
 * state.subscribe((newState) => console.log('State changed:', newState));
 * state.set({ count: 1 }); // Triggers subscriber
 * state.set((prev) => ({ count: prev.count + 1 })); // Functional update
 * console.log(state.get().count); // 2
 */
export function createObservable(initialState = {}) {
  let state = { ...initialState };
  const subscribers = new Set();

  return {
    /**
     * Get current state (returns a shallow copy to prevent direct mutation)
     */
    get() {
      return { ...state };
    },

    /**
     * Set state with partial update or function
     * @param {Object|Function} partialOrFn - Partial state object or function (prevState) => partialState
     */
    set(partialOrFn) {
      const partial = typeof partialOrFn === 'function' ? partialOrFn(state) : partialOrFn;
      
      // Merge partial into state
      const newState = { ...state, ...partial };
      
      // Only notify if state actually changed
      const changed = Object.keys(partial).some(key => state[key] !== newState[key]);
      
      if (changed) {
        state = newState;
        // Notify all subscribers with a copy of the new state
        subscribers.forEach(fn => {
          try {
            fn({ ...state });
          } catch (err) {
            console.error('[Observable] Subscriber error:', err);
          }
        });
      }
    },

    /**
     * Subscribe to state changes
     * @param {Function} fn - Callback (newState) => void
     * @returns {Function} Unsubscribe function
     */
    subscribe(fn) {
      if (typeof fn !== 'function') {
        throw new Error('[Observable] Subscriber must be a function');
      }
      subscribers.add(fn);
      // Return unsubscribe function
      return () => subscribers.delete(fn);
    },

    /**
     * Unsubscribe a specific callback
     * @param {Function} fn - Callback to remove
     */
    unsubscribe(fn) {
      subscribers.delete(fn);
    },

    /**
     * Clear all subscribers
     */
    clearSubscribers() {
      subscribers.clear();
    },

    /**
     * Get number of active subscribers (useful for debugging)
     */
    get subscriberCount() {
      return subscribers.size;
    }
  };
}
