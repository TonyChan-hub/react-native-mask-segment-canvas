// 补充 React Native 运行时可用的全局 API 类型声明

declare var performance: {
  now(): number;
};

declare function btoa(data: string): string;
declare function atob(data: string): string;

declare var TextEncoder: {
  prototype: TextEncoder;
  new (): TextEncoder;
};

declare interface TextEncoder {
  encode(input?: string): Uint8Array;
  encodeInto(input: string, dest: Uint8Array): { read: number; written: number };
  readonly encoding: string;
}
