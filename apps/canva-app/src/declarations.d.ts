declare interface NodeModule {
  hot?: {
    accept(path: string, callback: () => void): void;
  };
}

declare module "*.svg" {
  const url: string;
  export default url;
}

declare module "*.css";
