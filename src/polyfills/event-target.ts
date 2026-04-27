// MUST be imported before any module that captures `globalThis.EventTarget` at
// init time — specifically @solana/rpc-subscriptions-channel-websocket which
// does `var t = globalThis.EventTarget; var e = globalThis.WebSocket;` and then
// `new t()` / `new e(url)`. Hermes ships WebSocket but not EventTarget/CustomEvent.
//
// IMPORTANT: we do NOT use event-target-shim here. The shim wraps every
// dispatched event in its own internal Event class, which breaks
// `if (ev instanceof CustomEvent)` checks downstream in
// @solana/subscribable's getDataPublisherFromEventEmitter (the listener falls
// through to `subscriber()` with no data, then crashes on `.length` of undefined).
// We need a pass-through dispatcher that hands the original event object to
// listeners untouched.

if (typeof (globalThis as any).CustomEvent === 'undefined') {
  class CustomEventPolyfill<T = unknown> {
    type: string;
    detail: T | undefined;
    bubbles: boolean;
    cancelable: boolean;
    defaultPrevented = false;
    timeStamp = Date.now();
    target: any = null;
    currentTarget: any = null;
    eventPhase = 0;
    constructor(type: string, init?: { detail?: T; bubbles?: boolean; cancelable?: boolean }) {
      this.type = type;
      this.detail = init?.detail;
      this.bubbles = !!init?.bubbles;
      this.cancelable = !!init?.cancelable;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { /* no-op */ }
    stopImmediatePropagation() { /* no-op */ }
  }
  (globalThis as any).CustomEvent = CustomEventPolyfill;
}

if (typeof (globalThis as any).EventTarget === 'undefined') {
  type Listener = ((ev: any) => void) | { handleEvent(ev: any): void };
  type Entry = { listener: Listener; once: boolean };

  class EventTargetPolyfill {
    private _map = new Map<string, Entry[]>();

    addEventListener(type: string, listener: Listener, options?: boolean | { once?: boolean }): void {
      if (!listener) return;
      const once = typeof options === 'object' && !!options?.once;
      const entries = this._map.get(type) ?? [];
      entries.push({ listener, once });
      this._map.set(type, entries);
    }

    removeEventListener(type: string, listener: Listener): void {
      const entries = this._map.get(type);
      if (!entries) return;
      const next = entries.filter((e) => e.listener !== listener);
      if (next.length) this._map.set(type, next);
      else this._map.delete(type);
    }

    dispatchEvent(event: any): boolean {
      if (!event || typeof event.type !== 'string') return true;
      const entries = this._map.get(event.type);
      if (!entries || entries.length === 0) return !event.defaultPrevented;
      try { event.target = this; event.currentTarget = this; } catch { /* frozen event ok */ }
      // Snapshot to allow mutations during dispatch.
      const snapshot = entries.slice();
      const toDelete: Entry[] = [];
      for (const entry of snapshot) {
        try {
          if (typeof entry.listener === 'function') entry.listener.call(this, event);
          else entry.listener.handleEvent(event);
        } catch (err) {
          // Match DOM behavior: listener errors don't stop sibling listeners.
          // Surface async so it shows up in dev logs without poisoning dispatch.
          setTimeout(() => { throw err; }, 0);
        }
        if (entry.once) toDelete.push(entry);
      }
      if (toDelete.length) {
        const remaining = entries.filter((e) => !toDelete.includes(e));
        if (remaining.length) this._map.set(event.type, remaining);
        else this._map.delete(event.type);
      }
      return !event.defaultPrevented;
    }
  }

  (globalThis as any).EventTarget = EventTargetPolyfill;
}
