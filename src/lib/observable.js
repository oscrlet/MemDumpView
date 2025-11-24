/**
 * Observable: A lightweight reactive state management implementation
 * 
 * Provides a minimal API for creating observable state objects that can
 * notify subscribers when state changes. Used for MVVM data binding.
 * 
 * API:
 * - createObservable(initialState) -> Observable
 * - observable.get() -> current state
 * - observable.set(partial | fn) -> update state
 * - observable.subscribe(handler) -> unsubscribe function
 * - observable.unsubscribe(handler) -> void
 */

export function createObservable(initialState = {}) {
  let state = { ...initialState };
  const subscribers = new Set();

  const observable = {
    /**
     * Get current state (returns a shallow copy to prevent direct mutation)
     */
    get() {
      return { ...state };
    },

    /**
     * Set state - accepts partial state object or update function
     * @param {Object|Function} update - partial state or function(currentState) => newPartialState
     */
    set(update) {
      const oldState = { ...state };
      
      if (typeof update === 'function') {
        // Allow functional updates: (prevState) => ({ ...changes })
        const changes = update(state);
        state = { ...state, ...changes };
      } else if (update && typeof update === 'object') {
        // Merge partial state
        state = { ...state, ...update };
      }

      // Notify subscribers if state actually changed
      if (!shallowEqual(oldState, state)) {
        notify();
      }
    },

    /**
     * Subscribe to state changes
     * @param {Function} handler - callback(newState, oldState)
     * @returns {Function} unsubscribe function
     */
    subscribe(handler) {
      if (typeof handler !== 'function') {
        throw new Error('Observable.subscribe() requires a function handler');
      }
      subscribers.add(handler);
      
      // Return unsubscribe function
      return () => {
        subscribers.delete(handler);
      };
    },

    /**
     * Unsubscribe a handler
     * @param {Function} handler - the handler to remove
     */
    unsubscribe(handler) {
      subscribers.delete(handler);
    },

    /**
     * Get number of subscribers (useful for debugging)
     */
    subscriberCount() {
      return subscribers.size;
    }
  };

  function notify() {
    const currentState = observable.get();
    for (const handler of subscribers) {
      try {
        handler(currentState);
      } catch (error) {
        console.error('Observable subscriber error:', error);
      }
    }
  }

  return observable;
}

/**
 * Shallow equality check for objects
 */
function shallowEqual(obj1, obj2) {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }
  
  return true;
}
