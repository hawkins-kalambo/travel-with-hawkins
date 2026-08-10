// @types/node@^20 predates node:test's MockModuleOptions.exports (added
// after namedExports was deprecated on the Node 24 runtime this project
// targets). Augment rather than pin a newer @types/node just for this.
import "node:test";

declare module "node:test" {
  namespace test {
    interface MockModuleOptions {
      exports?: Record<string, unknown>;
    }
  }
}
