// Static asset imports inside this package (the Next apps get the same typing from next-env.d.ts).
declare module '*.svg' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any;
  export default content;
}
