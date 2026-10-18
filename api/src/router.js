// Minimal method + path router with `:param` segments.

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const keys = [];
    const source = pattern
      .split("/")
      .map((segment) => {
        if (segment.startsWith(":")) {
          keys.push(segment.slice(1));
          return "([^/]+)";
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler });
  }

  function match(method, pathname) {
    let pathMatched = false;
    for (const route of routes) {
      const found = route.regex.exec(pathname);
      if (!found) continue;
      pathMatched = true;
      if (route.method !== method && !(method === "HEAD" && route.method === "GET")) continue;
      const params = {};
      route.keys.forEach((key, i) => {
        try {
          params[key] = decodeURIComponent(found[i + 1]);
        } catch {
          params[key] = found[i + 1];
        }
      });
      return { handler: route.handler, params };
    }
    return { handler: null, pathMatched };
  }

  return {
    get: (p, h) => add("GET", p, h),
    post: (p, h) => add("POST", p, h),
    delete: (p, h) => add("DELETE", p, h),
    match,
  };
}
