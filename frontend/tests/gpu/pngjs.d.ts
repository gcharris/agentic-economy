// The slice of pngjs the GPU specs use (no @types package is installed).
declare module 'pngjs' {
  export class PNG {
    width: number;
    height: number;
    data: Uint8Array;
    static sync: { read(buf: Uint8Array): PNG };
  }
}
