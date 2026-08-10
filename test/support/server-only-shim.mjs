// `server-only` / `client-only` are compile-time markers that Next's bundler
// resolves specially; they aren't real npm packages, so plain `node --test`
// needs a no-op stand-in to satisfy `import "server-only"` side-effect imports.
export {};
