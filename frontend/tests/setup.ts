// jsdom setup for the `dom` vitest project: a <dialog> polyfill (showModal /
// close toggle the `open` attribute and fire `close`) and a matchMedia stub, so
// the Door dialog and prefers-reduced-motion work with no browser.

type DialogProto = HTMLDialogElement & { returnValue: string };

if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype as DialogProto;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      if (this.open) throw new DOMException('The dialog is already open', 'InvalidStateError');
      this.setAttribute('open', '');
      const focus = this.querySelector<HTMLElement>('[autofocus]');
      focus?.focus();
    };
  }
  if (typeof proto.show !== 'function') {
    proto.show = function show(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: DialogProto, returnValue?: string) {
      if (!this.open) return;
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
  if (!Object.getOwnPropertyDescriptor(proto, 'open')) {
    Object.defineProperty(proto, 'open', {
      configurable: true,
      get(this: HTMLDialogElement) { return this.hasAttribute('open'); },
      set(this: HTMLDialogElement, v: boolean) { if (v) this.setAttribute('open', ''); else this.removeAttribute('open'); },
    });
  }
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() { /* legacy */ },
    removeListener() { /* legacy */ },
    addEventListener() { /* no changes in jsdom */ },
    removeEventListener() { /* no changes in jsdom */ },
    dispatchEvent() { return false; },
  }) as MediaQueryList;
}

// requestAnimationFrame is absent in some jsdom versions; the render loop is never driven here anyway.
if (typeof window !== 'undefined' && typeof window.requestAnimationFrame !== 'function') {
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => setTimeout(() => cb(performance.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (h: number) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
}
