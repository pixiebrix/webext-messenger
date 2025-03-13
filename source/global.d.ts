// eslint-disable-next-line no-var -- `let/const` behave differently https://stackoverflow.com/a/69208755/288906
declare var __webextMessenger: string;

// https://github.com/parcel-bundler/parcel/issues/5758#issuecomment-1204354170
declare module "url:*" {
  const url: string;
  export default url;
}
