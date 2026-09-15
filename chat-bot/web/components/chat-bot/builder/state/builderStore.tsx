import { createContext, type ReactNode, useContext, useRef, useSyncExternalStore } from "react";
import type { ChatBot } from "../../../../api/types";
import { type BuilderAction, type BuilderState, builderReducer, createBuilderState } from "./builderReducer";

/**
 * Builder store: one plain object holding the state, updated only through
 * `dispatch(action)`. Components subscribe to the slice they render with
 * `useBuilder(selector)`, so an update re-renders only components whose slice changed.
 * The context value is the store itself and never changes.
 */
export const createBuilderStore = (chatBot: ChatBot) => {
  let state = createBuilderState(chatBot);
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (action: BuilderAction) => {
      const next = builderReducer(state, action);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
  };
};

export type BuilderStore = ReturnType<typeof createBuilderStore>;

const BuilderStoreContext = createContext<BuilderStore | null>(null);

export const BuilderStoreProvider = ({ store, children }: { store: BuilderStore; children: ReactNode }) => (
  <BuilderStoreContext.Provider value={store}>{children}</BuilderStoreContext.Provider>
);

export const useBuilderStore = () => {
  const store = useContext(BuilderStoreContext);
  if (!store) throw new Error("useBuilderStore must be used inside <BuilderStoreProvider>");
  return store;
};

export const useBuilderDispatch = () => useBuilderStore().dispatch;

/**
 * Subscribes to a slice of builder state. Pass `isEqual` (e.g. `shallowEqual`)
 * when the selector builds a new array/object each time.
 */
export const useBuilder = <T,>(selector: (state: BuilderState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T => {
  const store = useBuilderStore();
  const cache = useRef<{ state: BuilderState; selector: typeof selector; value: T }>(null);

  const getSnapshot = () => {
    const state = store.getState();
    const cached = cache.current;
    if (cached?.state === state && cached.selector === selector) return cached.value;
    const value = selector(state);
    const stableValue = cached && isEqual(cached.value, value) ? cached.value : value;
    cache.current = { state, selector, value: stableValue };
    return stableValue;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot);
};

export const shallowEqual = <T,>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
