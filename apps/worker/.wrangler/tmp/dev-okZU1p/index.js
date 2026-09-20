var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// ../../node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// ../../node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
}, "bufferToFormData");

// ../../node_modules/hono/dist/utils/body.js
var MAX_NESTING_DEPTH = 32;
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value, nestingState);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".", MAX_NESTING_DEPTH + 2);
  if (keys.length > MAX_NESTING_DEPTH + 1) {
    throwNestingLimitExceeded();
  }
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) {
          throwNestingLimitExceeded();
        }
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");
var throwNestingLimitExceeded = /* @__PURE__ */ __name(() => {
  throw new Error("Nesting limit exceeded");
}, "throwNestingLimitExceeded");

// ../../node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label2, next) => {
  if (label2 === "*") {
    return "*";
  }
  const match2 = label2.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label2}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label2, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label2, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str, "tryDecodeURIComponent");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return tryDecodeURIComponent(value);
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) {
    url = url.slice(0, hashIndex);
  }
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// ../../node_modules/hono/dist/request.js
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = tryDecodeURIComponent(value);
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    for (const anyCachedKey in bodyCache) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        const contentType = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
        return new Response(body, {
          headers: contentType ? { "Content-Type": contentType } : void 0
        })[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    ;
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// ../../node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// ../../node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   // Append multiple headers using the append option (e.g. Vary)
   *   c.header('Vary', 'Accept-Encoding', { append: true })
   *   c.header('Vary', 'User-Agent', { append: true })
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) {
        if (key === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) {
          if (++count > 1 || typeof headers[k] !== "string") {
            responseHeaders = new Headers();
            break;
          }
        }
      }
      if (responseHeaders) {
        for (const k in headers) {
          const v = headers[k];
          if (typeof v === "string") {
            responseHeaders.set(k, v);
          } else {
            responseHeaders.delete(k);
            for (const v2 of v) {
              responseHeaders.append(k, v2);
            }
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object2, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object2),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibytes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// ../../node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch", "query"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// ../../node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// ../../node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(methodName, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(methodName, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler of handlers) {
            this.#addRoute(methodName, this.#path, handler);
          }
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} env - env Object
   * @param {ExecutionContext} executionCtx - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// ../../node_modules/hono/dist/router/utils.js
var createNullObject = /* @__PURE__ */ __name(() => /* @__PURE__ */ Object.create(null), "createNullObject");

// ../../node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// ../../node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return b === TAIL_WILDCARD_REG_EXP_STR ? -1 : 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  // handler index of a dynamic path, or -1 for a static path terminal
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : null : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
        if (name && pattern[2]) {
          if (regexpStr === ".*") {
            throw PATH_ERROR;
          }
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) {
            throw PATH_ERROR;
          }
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) {
            throw PATH_ERROR;
          }
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ONLY_WILDCARD_REG_EXP_STR && regexpStr !== TAIL_WILDCARD_REG_EXP_STR) {
            for (const k in node.#children) {
              if (
                // a single-char pattern coexists with single-char literals as a literal does
                (regexpStr.length > 1 || k.length > 1) && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
              ) {
                throw PATH_ERROR;
              }
            }
          }
          nextNode = node.#children[regexpStr] = new _Node();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) {
            if (k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR) {
              throw PATH_ERROR;
            }
          }
          nextNode = node.#children[token] = new _Node();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) {
      throw PATH_ERROR;
    }
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// ../../node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  // dynamic path -> [handler index, param assoc]; static paths are not registered
  paths = createNullObject();
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// ../../node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    `^${path.replace(
      /\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g,
      (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ONLY_WILDCARD_REG_EXP_STR : `/:${LABEL_REG_EXP_STR}`
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function findMiddleware(middleware, path) {
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: createNullObject() };
    this.#routes = { [METHOD_NAME_ALL]: createNullObject() };
    this.#tries = { [METHOD_NAME_ALL]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      for (const handlerMap of [middleware, routes]) {
        handlerMap[method] = createNullObject();
        for (const p in handlerMap[METHOD_NAME_ALL]) {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
          this.#insertPath(method, p);
        }
      }
    }
    if (path === "/*") {
      path = "*";
    }
    const methods = method === METHOD_NAME_ALL ? Object.keys(middleware) : [method];
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      for (const m of methods) {
        if (!middleware[m][path]) {
          this.#insertPath(m, path);
          middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        }
      }
      for (const handlerMap of [middleware, routes]) {
        for (const m of methods) {
          for (const p in handlerMap[m]) {
            re.test(p) && handlerMap[m][p].push([handler, path]);
          }
        }
      }
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) {
      for (const m of methods) {
        if (!routes[m][path2]) {
          this.#insertPath(m, path2);
          routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || [];
        }
        routes[m][path2].push([handler, path2]);
      }
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#routes)) {
      matchers[method] = this.#buildMatcher(method);
    }
    this.#middleware = this.#routes = this.#tries = void 0;
    wildcardRegExpCache = createNullObject();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (const r of [middleware, routes]) {
      for (const path in r) {
        const handlers = r[path];
        const pathData = trie.paths[path];
        if (!pathData) {
          staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
          continue;
        }
        handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [
          h,
          trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
            map[key] = paramReplacementMap[pathData[1][i][1]];
            return map;
          }, createNullObject())
        ]);
      }
    }
    return [regexp, indexReplacementMap.map((i) => handlerData[i]), staticMap];
  }
};

// ../../node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// ../../node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new _Node2();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) {
        possibleKeys.add(pattern[1]);
      }
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: [...possibleKeys],
        score: ++order
      }
    });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) {
            continue;
          }
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// ../../node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node = new Node2();
  add(method, path, handler) {
    for (const result of checkOptionalParameter(path) || [path]) {
      this.#node.insert(method, result, handler);
    }
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// ../../node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// ../../packages/engine/src/types.ts
var PERSONALITIES = ["bold", "cautious", "vigilant", "social"];
var DRIVES = ["eat", "flee", "hide", "seek_mate", "nest", "explore"];
var FEAR_LEVELS = ["unconcerned", "wary", "alarmed", "panicked"];
var TIMING = {
  moveFed: 1,
  moveHungry: 2,
  moveStarving: 3,
  eat: 3,
  catEat: 10,
  trapOccupied: 10,
  mate: 5,
  gestation: 60,
  birth: 5,
  juvenile: 30,
  catRest: 10,
  catPatience: 30,
  catReturnToSighting: 30,
  pounceCooldown: 20,
  memoryLifetime: 300,
  intentHold: 12,
  intentHoldPanicked: 6
};
var PERCEPTION = { mouse: 6, vigilantMouse: 8, cat: 8 };
var CAT = {
  startingNutrition: 100,
  decayPerTick: 0.1,
  /** What one mouse is worth. Less than full, so a cat must keep hunting. */
  mealRestores: 50,
  hungryBelow: 50,
  perception: 8,
  perceptionHungry: 11,
  pounceRange: 3,
  pounceRangeHungry: 4,
  pounceCooldown: 20,
  pounceCooldownHungry: 10
};
var ALARM_RANGE = { normal: 1, social: 2 };
var NUTRITION_BANDS = { fed: 60, hungry: 30 };
var PUP_NUTRITION = 75;
function hungerBand(nutrition) {
  if (nutrition >= NUTRITION_BANDS.fed) return "fed";
  if (nutrition >= NUTRITION_BANDS.hungry) return "hungry";
  return "starving";
}
__name(hungerBand, "hungerBand");
function catBand(nutrition) {
  return nutrition >= CAT.hungryBelow ? "fed" : "hungry";
}
__name(catBand, "catBand");
var JITTER = 0.05;
var BATCH_SIZE = 8;
var ENGINE_VERSION = "0.1.0";
var PERSONALITY_TEXT = {
  bold: "Bold: approaches food despite nearby danger, explores far from shelter, and is slow to flee.",
  cautious: "Cautious: flees early, avoids any place it remembers as dangerous, and prefers to forage near where it has eaten before.",
  vigilant: "Vigilant: notices danger sooner than other mice and readily warns the ones it meets.",
  social: "Social: seeks out other mice, shares what it has seen readily, and looks for a mate as soon as it is able."
};

// ../../packages/engine/src/config.ts
var PRESETS = {
  small: { width: 48, height: 32 },
  medium: { width: 80, height: 50 },
  large: { width: 120, height: 75 }
};
function capsFor(preset) {
  const { width, height } = PRESETS[preset];
  const cells = width * height;
  return {
    mice: Math.floor(cells / 25),
    food: Math.floor(cells / 50),
    mouseholes: Math.floor(cells / 50),
    traps: Math.floor(cells / 100),
    cats: Math.floor(cells / 400)
  };
}
__name(capsFor, "capsFor");
var TICK_RANGE = { min: 100, max: 2e4 };
var MEASURED_DEFAULTS = {
  small: { cats: 1, traps: 4, foodPiles: 20, mouseholes: 16, foodRespawnTicks: 60, mice: 30 },
  medium: { cats: 3, traps: 8, foodPiles: 60, mouseholes: 24, foodRespawnTicks: 60, mice: 60 },
  large: { cats: 4, traps: 8, foodPiles: 80, mouseholes: 32, foodRespawnTicks: 60, mice: 60 }
};
function defaultConfig(preset) {
  const caps = capsFor(preset);
  const d = MEASURED_DEFAULTS[preset];
  return {
    preset,
    ticks: 2e3,
    maleMice: Math.floor(d.mice / 2),
    femaleMice: d.mice - Math.floor(d.mice / 2),
    cats: Math.min(d.cats, caps.cats),
    traps: Math.min(d.traps, caps.traps),
    foodPiles: Math.min(d.foodPiles, caps.food),
    mouseholes: Math.min(d.mouseholes, caps.mouseholes),
    foodRespawnTicks: d.foodRespawnTicks,
    // The sweep held this at 0.3, so the survival figure the configuration
    // screen shows is only exact while the default matches it.
    nutritionDecayPerTick: 0.3,
    startingNutrition: 100,
    personality: { bold: 25, cautious: 25, vigilant: 25, social: 25 }
  };
}
__name(defaultConfig, "defaultConfig");
var notANumber = /* @__PURE__ */ __name((v) => typeof v !== "number" || !Number.isFinite(v), "notANumber");
function validateConfig(c) {
  const errors = [];
  if (!(c.preset in PRESETS)) {
    return [{
      field: "preset",
      code: "out_of_range",
      message: `World must be one of ${Object.keys(PRESETS).join(", ")}; this asks for ${JSON.stringify(c.preset) ?? "nothing"}.`
    }];
  }
  const caps = capsFor(c.preset);
  if (notANumber(c.ticks) || !Number.isInteger(c.ticks) || c.ticks < TICK_RANGE.min || c.ticks > TICK_RANGE.max) {
    errors.push({
      field: "ticks",
      code: "out_of_range",
      message: `Tick count must be a whole number between ${TICK_RANGE.min} and ${TICK_RANGE.max}.`
    });
  }
  const mice = c.maleMice + c.femaleMice;
  if (Number.isFinite(mice) && mice > caps.mice) {
    errors.push({
      field: "mice",
      code: "above_cap",
      cap: caps.mice,
      message: `${label(c.preset)} allows ${caps.mice} mice in total; this asks for ${mice}.`
    });
  }
  for (const [field, value, cap] of [
    ["foodPiles", c.foodPiles, caps.food],
    ["mouseholes", c.mouseholes, caps.mouseholes],
    ["traps", c.traps, caps.traps],
    ["cats", c.cats, caps.cats]
  ]) {
    if (Number.isFinite(value) && value > cap) {
      errors.push({
        field,
        code: "above_cap",
        cap,
        message: `${label(c.preset)} allows ${cap} ${field}; this asks for ${value}.`
      });
    }
  }
  for (const [field, value] of [
    ["maleMice", c.maleMice],
    ["femaleMice", c.femaleMice],
    ["cats", c.cats],
    ["traps", c.traps],
    ["foodPiles", c.foodPiles],
    ["mouseholes", c.mouseholes],
    ["foodRespawnTicks", c.foodRespawnTicks]
  ]) {
    if (notANumber(value) || !Number.isInteger(value) || value < 0) {
      errors.push({
        field,
        code: "out_of_range",
        message: `${field} must be a whole number of zero or more.`
      });
    }
  }
  if (notANumber(c.nutritionDecayPerTick) || c.nutritionDecayPerTick <= 0 || c.nutritionDecayPerTick > 10) {
    errors.push({
      field: "nutritionDecayPerTick",
      code: "out_of_range",
      message: "Nutrition decay must be a number greater than zero and at most 10 per tick."
    });
  }
  const start = c.startingNutrition ?? 100;
  if (notANumber(start) || start <= 0 || start > 100) {
    errors.push({
      field: "startingNutrition",
      code: "out_of_range",
      message: "Starting nutrition must be a number greater than zero and at most 100."
    });
  }
  for (const p of PERSONALITIES) {
    const v = c.personality?.[p];
    if (notANumber(v) || v < 0 || v > 100) {
      errors.push({
        field: `personality.${p}`,
        code: "out_of_range",
        message: `${p} must be a number between 0 and 100.`
      });
    }
  }
  const sum = PERSONALITIES.reduce((t, p) => t + (c.personality?.[p] ?? 0), 0);
  if (notANumber(sum) || Math.abs(sum - 100) > 1e-9) {
    errors.push({
      field: "personality",
      code: "sum_not_100",
      message: `The four personality percentages must total 100; these total ${sum}.`
    });
  }
  return errors;
}
__name(validateConfig, "validateConfig");
var label = /* @__PURE__ */ __name((p) => p.charAt(0).toUpperCase() + p.slice(1), "label");
function drawPersonality(c, roll) {
  let acc = 0;
  for (const p of PERSONALITIES) {
    acc += c.personality[p] ?? 0;
    if (roll * 100 < acc) return p;
  }
  return "social";
}
__name(drawPersonality, "drawPersonality");

// ../../packages/engine/src/rng.ts
function splitmix32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 2654435769 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 16, 569420461);
    t = Math.imul(t ^ t >>> 15, 1935289751);
    return (t ^ t >>> 15) >>> 0;
  };
}
__name(splitmix32, "splitmix32");
var rotl = /* @__PURE__ */ __name((x, k) => (x << k | x >>> 32 - k) >>> 0, "rotl");
function createRng(seed) {
  const mix = splitmix32(seed);
  let s0 = mix(), s1 = mix(), s2 = mix(), s3 = mix();
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;
  const step = /* @__PURE__ */ __name(() => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = s1 << 9 >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  }, "step");
  const next = /* @__PURE__ */ __name(() => step() / 4294967296, "next");
  return {
    next,
    int: /* @__PURE__ */ __name((n) => n <= 0 ? 0 : Math.floor(next() * n), "int"),
    pick: /* @__PURE__ */ __name((xs) => xs.length === 0 ? void 0 : xs[Math.floor(next() * xs.length)], "pick"),
    state: /* @__PURE__ */ __name(() => [s0, s1, s2, s3], "state"),
    restore: /* @__PURE__ */ __name((s) => {
      s0 = s[0] >>> 0;
      s1 = s[1] >>> 0;
      s2 = s[2] >>> 0;
      s3 = s[3] >>> 0;
    }, "restore")
  };
}
__name(createRng, "createRng");

// ../../packages/engine/src/signals.ts
var chebyshev = /* @__PURE__ */ __name((a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)), "chebyshev");
var FEAR_FACTOR = {
  unconcerned: 0.5,
  wary: 1,
  alarmed: 1.5,
  panicked: 2
};
var linear = /* @__PURE__ */ __name((d) => 1 / (1 + d), "linear");
var quadratic = /* @__PURE__ */ __name((d) => 1 / (1 + d) ** 2, "quadratic");
function foodAt(c, s) {
  let v = 0;
  for (const p of s.food) v += linear(chebyshev(c, p));
  for (const t of s.suspectFood) v += 0.5 * linear(chebyshev(c, t));
  return v;
}
__name(foodAt, "foodAt");
function dangerAt(c, s, fear) {
  const f = FEAR_FACTOR[fear];
  let v = 0;
  for (const k of s.cats) v += 4 * quadratic(chebyshev(c, k) / f);
  for (const t of s.knownTraps) v += 2 * quadratic(chebyshev(c, t) / f);
  return v;
}
__name(dangerAt, "dangerAt");
function mateAt(c, s) {
  let v = 0;
  for (const q of s.mates) v += linear(chebyshev(c, q));
  return v;
}
__name(mateAt, "mateAt");
function shelterAt(c, s) {
  let v = 0;
  for (const h of s.shelter) v += linear(chebyshev(c, h));
  return v;
}
__name(shelterAt, "shelterAt");
function exploreAt(c, here, recent) {
  let mx = 0, my = 0;
  for (let i = 1; i < recent.length; i++) {
    mx += recent[i].x - recent[i - 1].x;
    my += recent[i].y - recent[i - 1].y;
  }
  const len = Math.hypot(mx, my);
  const dx = c.x - here.x, dy = c.y - here.y;
  const dlen = Math.hypot(dx, dy);
  if (len === 0 || dlen === 0) return 0.5;
  return (mx / len * (dx / dlen) + my / len * (dy / dlen) + 1) / 2;
}
__name(exploreAt, "exploreAt");
function normalize(values) {
  const lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1e-12) return values.map(() => 0);
  return values.map((v) => (v - lo) / (hi - lo));
}
__name(normalize, "normalize");
var NEIGHBOURS = [
  { dx: 0, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 }
];

// ../../packages/engine/src/memory.ts
var MAX_MEMORIES = 5;
function bearingFrom(from, to) {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx === 0 && dy < 0) return "north";
  if (dx > 0 && dy < 0) return "northeast";
  if (dx > 0 && dy === 0) return "east";
  if (dx > 0 && dy > 0) return "southeast";
  if (dx === 0 && dy > 0) return "south";
  if (dx < 0 && dy > 0) return "southwest";
  if (dx < 0 && dy === 0) return "west";
  if (dx < 0 && dy < 0) return "northwest";
  return "north";
}
__name(bearingFrom, "bearingFrom");
function whenWord(age) {
  if (age < 20) return "just now";
  if (age < 100) return "a little while ago";
  return "a while ago";
}
__name(whenWord, "whenWord");
function sentenceFor(kind, bearing, age, provenance) {
  const when = whenWord(age);
  if (provenance === "heard") {
    const what = kind === "cat_kill" ? "a cat" : "a trap";
    return `Another mouse warned you about ${what} to the ${bearing}, ${when}.`;
  }
  switch (kind) {
    case "trap_death":
      return `You saw a mouse die in a trap to the ${bearing}, ${when}.`;
    case "cat_kill":
      return `You saw a cat catch and eat a mouse to the ${bearing}, ${when}.`;
    case "narrow_escape":
      return `You barely escaped a trap to the ${bearing}, ${when}.`;
  }
}
__name(sentenceFor, "sentenceFor");
function addMemory(memories, m) {
  const next = [...memories, m];
  return next.length > MAX_MEMORIES ? next.slice(next.length - MAX_MEMORIES) : next;
}
__name(addMemory, "addMemory");
function expireMemories(memories, tick) {
  return memories.filter((m) => tick - m.addedAt <= TIMING.memoryLifetime);
}
__name(expireMemories, "expireMemories");
function freshestSeen(memories) {
  let best;
  for (const m of memories) {
    if (m.provenance !== "seen") continue;
    if (m.kind === "narrow_escape") continue;
    if (!best || m.addedAt > best.addedAt) best = m;
  }
  return best;
}
__name(freshestSeen, "freshestSeen");

// ../../packages/engine/src/questions.ts
var DRIVE_CRITERIA = {
  eat: {
    what: "Go to food and eat it.",
    when: "Hunger is pressing enough to be worth the trip, or food is close and safe.",
    not_for: "A mouse that is full, or one that must escape an immediate threat first.",
    examples: [
      "A hungry mouse with a food pile nearby and no cat in sight.",
      "A starving mouse that will die without food soon."
    ]
  },
  flee: {
    what: "Run away from the danger.",
    when: "A cat is close enough to be a threat right now.",
    not_for: "Remembered danger with no cat currently visible; that is a reason to be wary, not to run.",
    examples: ["A cat very close and stalking toward this mouse."]
  },
  hide: {
    what: "Run to a free mousehole and wait there, safe but unable to eat.",
    when: "Danger is present, shelter is reachable, and this mouse can afford to wait.",
    not_for: "A starving mouse, which would die waiting.",
    examples: ["A cautious mouse with a cat nearby and a free mousehole close by."]
  },
  seek_mate: {
    what: "Approach another mouse to mate.",
    when: "This mouse is safe, well fed, and a suitable partner is visible.",
    not_for: "A hungry mouse, or one with a cat in sight.",
    examples: ["A fed mouse with no danger nearby and a healthy partner very close."]
  },
  nest: {
    what: "Go to a free mousehole to give birth.",
    when: "This mouse is carrying a litter and ready, and shelter is available.",
    not_for: "Any mouse that is not carrying a litter.",
    examples: ["A pregnant mouse ready to give birth with a free mousehole nearby."]
  },
  explore: {
    what: "Wander into unfamiliar ground looking for food, mates, or shelter.",
    when: "Nothing else is pressing.",
    not_for: "A mouse with a clear immediate need.",
    examples: ["A fed mouse with no food, danger, or partner in sight."]
  }
};
var FEAR_RUBRIC = [
  {
    what: "Unconcerned. Nothing threatening in sight or in memory.",
    signals: ["No cat visible", "No remembered deaths nearby"]
  },
  {
    what: "Wary. Something is off, but nothing immediate.",
    signals: [
      "A cat was around recently but is not visible now",
      "A remembered death some distance away"
    ]
  },
  {
    what: "Alarmed. Real danger is present or freshly remembered.",
    signals: ["A cat is visible and hunting", "A mouse died nearby just now"]
  },
  {
    what: "Panicked. Danger is immediate and close.",
    signals: [
      "A cat is adjacent or very close and coming",
      "This mouse just escaped a trap"
    ]
  }
];
var CAT_MODE_CRITERIA = {
  prowl: { what: "Wander and look for a better opportunity." },
  stalk: { what: "Close on the chosen mouse steadily, one step at a time." },
  pounce: {
    what: "Spring two cells at the chosen mouse now.",
    when: "Only when it is very close and the cat is not still recovering from the last pounce."
  },
  rest: { what: "Hold still and wait." }
};
function driveQuestion(id, options) {
  const criteria = {};
  for (const d of options) criteria[d] = DRIVE_CRITERIA[d];
  return {
    type: "choice",
    instructions: {
      question: `What should the mouse at \`${id}\` do right now?`,
      focus: "Weigh how hungry it is against the danger it can see or remembers, and account for its personality. Pick the one drive that fits this moment."
    },
    criteria
  };
}
__name(driveQuestion, "driveQuestion");
function fearQuestion(id) {
  return {
    type: "score",
    instructions: {
      question: `How afraid should the mouse at \`${id}\` be right now?`,
      focus: "Judge fear from what it can see and what it remembers, and from its personality. This is about how much room it should give danger, not about what it should do."
    },
    criteria: FEAR_RUBRIC
  };
}
__name(fearQuestion, "fearQuestion");
function catTargetQuestion(id, candidates) {
  const criteria = {};
  for (const c of candidates) criteria[c.id] = { what: c.description };
  criteria.none_worth_it = {
    what: "No mouse here is worth chasing.",
    when: "Every mouse is fast, far, or about to reach shelter."
  };
  return {
    type: "choice",
    instructions: {
      question: `Which mouse should the cat at \`${id}\` go after?`,
      focus: "Prefer a mouse that is easy to catch: slow, alone, out in the open, and close. A mouse heading for a mousehole may escape."
    },
    criteria
  };
}
__name(catTargetQuestion, "catTargetQuestion");
function catModeQuestion(id) {
  return {
    type: "choice",
    instructions: {
      question: `How should the cat at \`${id}\` move now?`,
      focus: "Match the approach to the distance and to how likely the mouse is to escape."
    },
    criteria: CAT_MODE_CRITERIA
  };
}
__name(catModeQuestion, "catModeQuestion");
function catCandidateText(m, distance, bearing, companions) {
  const pace = m.nutrition >= 60 ? "moving at full speed" : m.nutrition >= 30 ? "moving slowly because it is hungry" : "barely moving, close to starving";
  const company = companions === 0 ? "alone" : companions === 1 ? "with one other mouse" : `among ${String(companions)} other mice`;
  return `${pace.charAt(0).toUpperCase()}${pace.slice(1)}, ${company}, ${distance} to the ${bearing}.`;
}
__name(catCandidateText, "catCandidateText");
var FEAR_FROM_SCORE = /* @__PURE__ */ __name((score, levels) => {
  const i = Math.max(0, Math.min(levels.length - 1, Math.round(score)));
  return levels[i] ?? levels[0];
}, "FEAR_FROM_SCORE");

// ../../packages/engine/src/decisions.ts
function bucketNutrition(pct) {
  if (pct >= 90) return "full";
  if (pct >= NUTRITION_BANDS.fed) return "fed";
  if (pct >= NUTRITION_BANDS.hungry) return "hungry";
  if (pct >= 10) return "very hungry";
  return "starving";
}
__name(bucketNutrition, "bucketNutrition");
function bucketDistance(cells) {
  if (cells <= 1) return "adjacent";
  if (cells <= 3) return "very close";
  if (cells <= 6) return "nearby";
  return "far";
}
__name(bucketDistance, "bucketDistance");
function bucketAge(ticks) {
  if (ticks < TIMING.juvenile) return "a pup, too young to mate";
  if (ticks <= 200) return "a young adult";
  return "a grown adult";
}
__name(bucketAge, "bucketAge");
function catStateWord(mode, closing) {
  if (mode === "eating") return "eating a mouse";
  if (mode === "rest") return "resting";
  if (mode === "pounce") return "about to pounce";
  if (mode === "stalk" || closing) return "stalking toward you";
  return "prowling";
}
__name(catStateWord, "catStateWord");
function phrase(label2, d, bearing) {
  return `${label2} ${bucketDistance(d)} to the ${bearing}`;
}
__name(phrase, "phrase");
function stateForMouse(c) {
  const surroundings = {};
  surroundings["food"] = c.nearestFood ? phrase(
    c.nearestFood.suspect ? "a food smell" : "a food pile",
    c.nearestFood.distance,
    c.nearestFood.bearing
  ) : "nothing to eat that you can smell";
  surroundings["cats"] = c.nearestCat ? `a cat ${bucketDistance(c.nearestCat.distance)} to the ${c.nearestCat.bearing}, ${c.nearestCat.word}` : "no cat in sight";
  surroundings["mice"] = c.nearestMate ? `${c.nearestMate.condition}, ${phrase("", c.nearestMate.distance, c.nearestMate.bearing).trim()}` : "no other mouse worth approaching in sight";
  surroundings["shelter"] = c.nearestShelter ? phrase("a free mousehole", c.nearestShelter.distance, c.nearestShelter.bearing) : "no free mousehole in reach";
  surroundings["knownTraps"] = c.knownTrap ? phrase("a trap you know about", c.knownTrap.distance, c.knownTrap.bearing) : "no trap you know about nearby";
  const mouse = {
    sex: c.sex,
    age: bucketAge(c.age),
    hunger: bucketNutrition(c.nutrition),
    personality: PERSONALITY_TEXT[c.personality],
    condition: c.movingSlowly ? "moving slowly because it is hungry" : "moving at full speed"
  };
  if (c.pregnantPastTerm) mouse["pregnant"] = "carrying a litter, ready to give birth";
  return { mouse, surroundings, memories: c.memories.map((m) => m.sentence) };
}
__name(stateForMouse, "stateForMouse");
var BLOCK = 16;
function spatialOrder(agents) {
  const key = /* @__PURE__ */ __name((p) => {
    const bx = Math.floor(p.x / BLOCK), by = Math.floor(p.y / BLOCK);
    return by * 1e3 + (by % 2 === 0 ? bx : 999 - bx);
  }, "key");
  return [...agents].sort((a, b) => {
    const ka = key(a.at), kb = key(b.at);
    if (ka !== kb) return ka - kb;
    if (a.at.y !== b.at.y) return a.at.y - b.at.y;
    if (a.at.x !== b.at.x) return a.at.x - b.at.x;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
__name(spatialOrder, "spatialOrder");
function chunk(xs, size) {
  const out = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
__name(chunk, "chunk");
function composeRequests(world, ready, nextBatchId) {
  const readySet = new Set(ready);
  const mice = world.mice.filter((m) => readySet.has(m.id) && !m.inHole);
  const cats = world.cats.filter((c) => readySet.has(c.id));
  const requests = [];
  for (const group of chunk(spatialOrder(mice), BATCH_SIZE)) {
    const state = {};
    const questions = {};
    const contexts = {};
    for (const m of group) {
      const ctx = contextFor(world, m.id);
      contexts[m.id] = ctx;
      state[m.id] = stateForMouse(ctx);
      questions[`drive_${m.id}`] = driveQuestion(m.id, ctx.options);
      questions[`fear_${m.id}`] = fearQuestion(m.id);
    }
    requests.push({ batchId: nextBatchId(), state, questions, contexts, agents: group.map((m) => m.id) });
  }
  for (const group of chunk(spatialOrder(cats), BATCH_SIZE)) {
    const state = {};
    const questions = {};
    const contexts = {};
    for (const c of group) {
      const reach = c.hungry ? CAT.perceptionHungry : CAT.perception;
      const seen = world.mice.filter((m) => !m.inHole && chebyshev(m.at, c.at) <= reach).sort((a, b) => a.id < b.id ? -1 : 1);
      const candidates = seen.map((m) => ({
        id: m.id,
        description: catCandidateText(
          m,
          bucketDistance(chebyshev(m.at, c.at)),
          bearingFrom(c.at, m.at),
          seen.filter((o) => o.id !== m.id && chebyshev(o.at, m.at) <= 2).length
        )
      }));
      contexts[c.id] = { at: c.at, mode: c.mode, candidates: seen.map((m) => ({
        id: m.id,
        distance: chebyshev(m.at, c.at),
        nutrition: m.nutrition
      })) };
      state[c.id] = {
        cat: {
          doing: c.mode === "rest" ? "resting" : `${c.mode}ing`,
          hunger: c.nutrition >= CAT.hungryBelow ? "well fed" : c.nutrition > CAT.hungryBelow / 2 ? "hungry" : "starving"
        },
        mice: candidates.map((x) => x.description)
      };
      questions[`target_${c.id}`] = catTargetQuestion(c.id, candidates);
      questions[`mode_${c.id}`] = catModeQuestion(c.id);
    }
    requests.push({
      batchId: nextBatchId(),
      state,
      questions,
      contexts,
      agents: group.map((c) => c.id)
    });
  }
  return requests;
}
__name(composeRequests, "composeRequests");
function contextFor(world, id) {
  const m = world.mice.find((x) => x.id === id);
  if (!m) throw new Error(`no mouse ${id}`);
  const perception = m.personality === "vigilant" ? 8 : 6;
  const near = /* @__PURE__ */ __name((xs, limit = perception) => {
    let best = null;
    for (const x of xs) {
      const d = chebyshev(m.at, x.at);
      if (d > limit) continue;
      if (!best || d < best.d) best = { item: x, d };
    }
    return best;
  }, "near");
  const bearingOf = /* @__PURE__ */ __name((to) => {
    const dx = Math.sign(to.x - m.at.x), dy = Math.sign(to.y - m.at.y);
    return [["northwest", "north", "northeast"], ["west", "here", "east"], ["southwest", "south", "southeast"]][dy + 1][dx + 1];
  }, "bearingOf");
  const cat = near(world.cats);
  const food = near(world.food.filter((f) => f.present), 999);
  const hole = near(world.holes.filter((h) => h.occupancy === "empty"), 999);
  const mate = near(world.mice.filter((o) => o.id !== m.id && o.sex !== m.sex && o.age >= TIMING.juvenile && !o.inHole));
  const knownTrap = near(world.traps.filter((t) => m.memories.some((mem) => mem.at.x === t.at.x && mem.at.y === t.at.y)), 999);
  return {
    id: m.id,
    sex: m.sex,
    personality: m.personality,
    nutrition: m.nutrition,
    age: m.age,
    pregnantPastTerm: m.pregnantSince !== null && world.tick - m.pregnantSince >= TIMING.gestation,
    movingSlowly: m.nutrition < NUTRITION_BANDS.fed,
    nearestCat: cat ? {
      distance: cat.d,
      bearing: bearingOf(cat.item.at),
      word: catStateWord(cat.item.mode, cat.item.target === m.id)
    } : null,
    nearestFood: food ? { distance: food.d, bearing: bearingOf(food.item.at), suspect: false } : null,
    nearestMate: mate ? {
      distance: mate.d,
      bearing: bearingOf(mate.item.at),
      condition: `a ${mate.item.personality} ${mate.item.sex}, ${bucketNutrition(mate.item.nutrition)}`
    } : null,
    nearestShelter: hole ? { distance: hole.d, bearing: bearingOf(hole.item.at) } : null,
    knownTrap: knownTrap ? { distance: knownTrap.d, bearing: bearingOf(knownTrap.item.at) } : null,
    memories: m.memories,
    options: availableDrives({
      food: food !== null,
      danger: cat !== null,
      shelter: hole !== null,
      mate: mate !== null,
      nesting: m.pregnantSince !== null && world.tick - m.pregnantSince >= TIMING.gestation,
      nutrition: m.nutrition
    })
  };
}
__name(contextFor, "contextFor");
function availableDrives(p) {
  const out = ["explore"];
  if (p.food) out.unshift("eat");
  if (p.danger) out.unshift("flee");
  if (p.shelter && p.nutrition >= NUTRITION_BANDS.fed) out.push("hide");
  if (p.mate) out.push("seek_mate");
  if (p.nesting && p.shelter) out.push("nest");
  return DRIVES.filter((d) => out.includes(d));
}
__name(availableDrives, "availableDrives");
var choice = /* @__PURE__ */ __name((probs) => {
  const entries = Object.entries(probs);
  const top = entries.reduce((a, b) => b[1] > a[1] ? b : a);
  const spread = entries.reduce((t, [, v]) => t + v * v, 0);
  return { type: "choice", choice: top[0], probabilities: probs, confidence: spread };
}, "choice");
var DANGER_FLOOR = 0.2;
function baselineDrive(c) {
  const dCat = c.nearestCat?.distance ?? Infinity;
  const dHole = c.nearestShelter?.distance ?? Infinity;
  const has = /* @__PURE__ */ __name((d) => c.options.includes(d), "has");
  const pick = /* @__PURE__ */ __name((o) => {
    const out = {};
    let total = 0;
    for (const d of c.options) {
      const v = o[d] ?? 0;
      out[d] = v;
      total += v;
    }
    if (total === 0) {
      for (const d of c.options) out[d] = d === "explore" ? 1 : 0;
      return out;
    }
    for (const d of c.options) out[d] = (out[d] ?? 0) / total;
    return out;
  }, "pick");
  const seen = /* @__PURE__ */ __name((w) => {
    if (!has("flee") || !Number.isFinite(dCat) || (w.flee ?? 0) > 0) return w;
    const out = { ...w, flee: DANGER_FLOOR };
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(out)) out[k] = (out[k] ?? 0) / total;
    return out;
  }, "seen");
  if (dCat <= 2 && dHole > 4 && has("flee")) return pick({ flee: 0.85, explore: 0.15 });
  if (dCat <= 4 && dHole <= 4 && has("hide")) return pick({ hide: 0.7, flee: 0.3 });
  if (c.nutrition < 30 && has("eat")) return seen(pick({ eat: 0.9, explore: 0.1 }));
  if (c.pregnantPastTerm && has("nest")) return seen(pick({ nest: 0.8, explore: 0.2 }));
  if (c.nutrition < 60 && has("eat")) return seen(pick({ eat: 0.65, explore: 0.35 }));
  if (has("seek_mate") && c.nutrition >= 60 && dCat > 6) {
    return seen(pick({ seek_mate: 0.6, explore: 0.4 }));
  }
  return seen(pick({ explore: 1 }));
}
__name(baselineDrive, "baselineDrive");
function baselineFear(c, tick) {
  const d = c.nearestCat?.distance ?? Infinity;
  if (d <= 1) return "panicked";
  if (d <= 4) return "alarmed";
  if (d <= 8) return "wary";
  const fresh = c.memories.some((m) => m.kind !== "narrow_escape" && tick - m.addedAt < 100);
  return fresh ? "wary" : "unconcerned";
}
__name(baselineFear, "baselineFear");
var isCatContext = /* @__PURE__ */ __name((c) => typeof c === "object" && c !== null && Array.isArray(c.candidates), "isCatContext");
function baselineCat(c) {
  if (c.candidates.length === 0) return { target: "none_worth_it", mode: "prowl" };
  const cost = /* @__PURE__ */ __name((m) => m.distance + m.nutrition / 20, "cost");
  const best = c.candidates.reduce((a, b) => cost(b) < cost(a) ? b : a);
  return { target: best.id, mode: best.distance <= 3 ? "pounce" : "stalk" };
}
__name(baselineCat, "baselineCat");
function baselineSubjects(req, tick) {
  return req.agents.map((id) => {
    const raw2 = req.contexts?.[id];
    if (isCatContext(raw2)) return baselineCatSubject(req, id, raw2);
    const ctx = raw2;
    const probs = ctx ? baselineDrive(ctx) : { explore: 1 };
    const fear = ctx ? baselineFear(ctx, tick) : "unconcerned";
    const drive = choice(probs);
    return {
      agentId: id,
      state: req.state[id] ?? {},
      options: ctx ? [...ctx.options] : ["explore"],
      answers: {
        drive,
        fear: {
          type: "score",
          score: FEAR_LEVELS.indexOf(fear),
          confidence: 1,
          probabilities: Object.fromEntries(
            FEAR_LEVELS.map((l, i) => [i, l === fear ? 1 : 0])
          )
        }
      },
      intent: drive.choice,
      lowConfidence: false,
      fear,
      weights: probs
    };
  });
}
__name(baselineSubjects, "baselineSubjects");
function baselineCatSubject(req, id, ctx) {
  const { target, mode } = baselineCat(ctx);
  const certain = /* @__PURE__ */ __name((label2, labels) => ({
    type: "choice",
    choice: label2,
    confidence: 1,
    probabilities: Object.fromEntries(labels.map((l) => [l, l === label2 ? 1 : 0]))
  }), "certain");
  const targets = [...ctx.candidates.map((m) => m.id), "none_worth_it"];
  return {
    agentId: id,
    state: req.state[id] ?? {},
    options: ["prowl", "stalk", "pounce", "rest"],
    answers: {
      target: certain(target, targets),
      mode: certain(mode, ["prowl", "stalk", "pounce", "rest"])
    },
    intent: mode,
    lowConfidence: false,
    fear: "unconcerned",
    weights: {}
  };
}
__name(baselineCatSubject, "baselineCatSubject");
function baselineBatch(req, tick) {
  return { subjects: baselineSubjects(req, tick), source: "baseline", latencyMs: 0 };
}
__name(baselineBatch, "baselineBatch");
function baselineProvider() {
  return {
    decide: /* @__PURE__ */ __name((requests) => {
      const out = {};
      for (const req of requests) out[req.batchId] = baselineBatch(req, 0);
      return Promise.resolve(out);
    }, "decide")
  };
}
__name(baselineProvider, "baselineProvider");

// ../../packages/engine/src/engine.ts
var DECISION_TIMEOUT_MS = 2e3;
var pad = /* @__PURE__ */ __name((n) => String(n).padStart(4, "0"), "pad");
function createEngine(o) {
  return build(o.config, o.seed, o.provider, null);
}
__name(createEngine, "createEngine");
function restore(snap, o) {
  const s = snap;
  if (s.version !== 1) throw new Error(`unsupported snapshot version ${String(s.version)}`);
  return build(s.config, s.seed, o.provider, s);
}
__name(restore, "restore");
function build(config, seed, provider, from) {
  const { width, height } = PRESETS[config.preset];
  const caps = capsFor(config.preset);
  const rng = createRng(seed);
  let tick = 0;
  let seq = 0;
  let nextMouse = 1;
  let batchNo = 0;
  let ended = false;
  let buffer = [];
  let mice = [];
  let cats = [];
  let miceVersion = 0;
  let sortedCache = null;
  const sortedMice = /* @__PURE__ */ __name(() => {
    if (sortedCache?.version === miceVersion) return sortedCache.order;
    const order2 = [...mice].sort(byId);
    sortedCache = { version: miceVersion, order: order2 };
    return order2;
  }, "sortedMice");
  let food = [];
  let traps = [];
  let holes = [];
  const emit = /* @__PURE__ */ __name((e) => {
    buffer.push({ ...e, tick, seq: seq++ });
  }, "emit");
  const occupiedByAnimal = /* @__PURE__ */ __name((x, y) => mice.some((m) => !m.inHole && m.x === x && m.y === y) || cats.some((c) => c.x === x && c.y === y), "occupiedByAnimal");
  const freeCell = /* @__PURE__ */ __name((avoid) => {
    for (let attempt = 0; attempt < 4e3; attempt++) {
      const x = rng.int(width), y = rng.int(height);
      if (!avoid(x, y)) return { x, y };
    }
    return { x: rng.int(width), y: rng.int(height) };
  }, "freeCell");
  const hasHole = /* @__PURE__ */ __name((x, y) => holes.some((h) => h.x === x && h.y === y), "hasHole");
  const hasFood = /* @__PURE__ */ __name((x, y) => food.some((f) => f.x === x && f.y === y), "hasFood");
  const hasTrap = /* @__PURE__ */ __name((x, y) => traps.some((t) => t.x === x && t.y === y), "hasTrap");
  if (from) {
    tick = from.tick;
    seq = from.seq;
    nextMouse = from.nextMouse;
    ended = from.ended;
    batchNo = from.batchNo;
    miceVersion++;
    mice = from.mice.map((m) => ({
      ...m,
      memories: m.memories.map((x) => ({ ...x })),
      recent: m.recent.map((c) => ({ ...c })),
      alarmedAt: { ...m.alarmedAt },
      seen: [...m.seen],
      weights: { ...m.weights }
    }));
    cats = from.cats.map((c) => ({
      ...c,
      lastSighting: c.lastSighting ? { ...c.lastSighting } : null,
      seen: [...c.seen],
      drift: { ...c.drift }
    }));
    food = from.food.map((f) => ({ ...f }));
    traps = from.traps.map((t) => ({ ...t }));
    holes = from.holes.map((h) => ({ ...h, brood: [...h.brood] }));
    rng.restore(from.rng);
  } else {
    for (let i = 0; i < Math.min(config.mouseholes, caps.mouseholes); i++) {
      const c = freeCell((x, y) => hasHole(x, y));
      holes.push({ id: `h${pad(i + 1)}`, x: c.x, y: c.y, adult: null, brood: [] });
    }
    for (let i = 0; i < Math.min(config.foodPiles, caps.food); i++) {
      const c = freeCell((x, y) => hasHole(x, y) || hasFood(x, y));
      food.push({ id: `f${pad(i + 1)}`, x: c.x, y: c.y, present: true, respawnAt: 0 });
    }
    for (let i = 0; i < Math.min(config.traps, caps.traps); i++) {
      const c = freeCell((x, y) => hasHole(x, y) || hasFood(x, y) || hasTrap(x, y));
      traps.push({ id: `t${pad(i + 1)}`, x: c.x, y: c.y, occupantId: null, respawnAt: 0 });
    }
    emit({ kind: "run_started", config, seed, engineVersion: ENGINE_VERSION });
    const start = config.startingNutrition ?? 100;
    const wanted = Math.min(config.maleMice + config.femaleMice, caps.mice);
    for (let i = 0; i < wanted; i++) {
      const sex = i < Math.min(config.maleMice, wanted) ? "male" : "female";
      const personality = drawPersonality(config, rng.next());
      const c = freeCell((x, y) => hasHole(x, y) || hasTrap(x, y) || occupiedByAnimal(x, y));
      const m = newMouse(`m${pad(nextMouse++)}`, sex, personality, c, start, false);
      mice.push(m);
      miceVersion++;
      emit({ kind: "mouse_spawned", id: m.id, sex, personality });
    }
    for (let i = 0; i < Math.min(config.cats, caps.cats); i++) {
      const c = freeCell((x, y) => hasHole(x, y) || occupiedByAnimal(x, y));
      cats.push({
        id: `c${pad(i + 1)}`,
        x: c.x,
        y: c.y,
        mode: "prowl",
        target: null,
        nutrition: CAT.startingNutrition,
        band: "fed",
        seen: [],
        pounceCooldown: 0,
        patience: 0,
        lastSighting: null,
        sightingUntil: 0,
        busyUntil: 0,
        bestDistance: null,
        drift: { dx: 0, dy: 0 }
      });
    }
  }
  function newMouse(id, sex, personality, at2, nutrition, isPup) {
    return {
      id,
      sex,
      personality,
      nutrition,
      age: 0,
      x: at2.x,
      y: at2.y,
      inHole: null,
      intent: null,
      intentSetAt: -TIMING.intentHold,
      fear: "unconcerned",
      weights: {},
      memories: [],
      pregnantSince: null,
      nextMoveTick: 0,
      busyUntil: 0,
      busyWith: null,
      eatingFoodId: null,
      mateTarget: null,
      isPup,
      recent: [{ ...at2 }],
      alarmedAt: {},
      decidedAt: -9999,
      band: hungerBand(nutrition),
      seen: []
    };
  }
  __name(newMouse, "newMouse");
  const perceptionOf = /* @__PURE__ */ __name((m) => m.personality === "vigilant" ? PERCEPTION.vigilantMouse : PERCEPTION.mouse, "perceptionOf");
  const knowsTrap = /* @__PURE__ */ __name((m, t) => t.occupantId !== null && chebyshev({ x: m.x, y: m.y }, { x: t.x, y: t.y }) <= perceptionOf(m) || m.memories.some((mem) => mem.at.x === t.x && mem.at.y === t.y), "knowsTrap");
  let cache = {
    tick: -1,
    food: [],
    liveTraps: [],
    cats: [],
    holes: [],
    adults: []
  };
  function refreshCache() {
    if (cache.tick === tick) return;
    cache = {
      tick,
      food: food.filter((f) => f.present).map((f) => ({ x: f.x, y: f.y })),
      liveTraps: traps.filter((x) => x.occupantId === null).map((x) => ({ at: { x: x.x, y: x.y }, id: x.id })),
      cats: cats.map((c) => ({ x: c.x, y: c.y })),
      holes: holes.filter((h) => h.adult === null && h.brood.length === 0).map((h) => ({ x: h.x, y: h.y })),
      adults: mice.filter((o) => !o.inHole && o.age >= TIMING.juvenile)
    };
  }
  __name(refreshCache, "refreshCache");
  function sourcesFor(m) {
    refreshCache();
    const here = { x: m.x, y: m.y };
    const r = perceptionOf(m);
    const known = [];
    const suspect = [];
    for (const t2 of cache.liveTraps) {
      const remembered = m.memories.some((mem) => mem.at.x === t2.at.x && mem.at.y === t2.at.y);
      (remembered ? known : suspect).push(t2.at);
    }
    for (const t2 of traps) {
      if (t2.occupantId !== null && chebyshev(here, { x: t2.x, y: t2.y }) <= r) {
        known.push({ x: t2.x, y: t2.y });
      }
    }
    return {
      food: cache.food,
      suspectFood: suspect,
      knownTraps: known,
      cats: cache.cats.filter((c) => chebyshev(here, c) <= r),
      mates: cache.adults.filter((o) => o.id !== m.id && o.sex !== m.sex && chebyshev(here, { x: o.x, y: o.y }) <= r).map((o) => ({ x: o.x, y: o.y })),
      shelter: cache.holes
    };
  }
  __name(sourcesFor, "sourcesFor");
  function scoresFor(m) {
    const here = { x: m.x, y: m.y };
    const s = sourcesFor(m);
    const cells = NEIGHBOURS.map((n) => ({ x: here.x + n.dx, y: here.y + n.dy })).filter((c) => c.x >= 0 && c.x < width && c.y >= 0 && c.y < height);
    const raw2 = cells.map((c) => ({
      cell: c,
      danger: dangerAt(c, s, m.fear),
      food: foodAt(c, s),
      shelter: shelterAt(c, s),
      mate: mateAt(c, s),
      explore: exploreAt(c, here, m.recent)
    }));
    const nd = normalize(raw2.map((r) => r.danger));
    const nf = normalize(raw2.map((r) => r.food));
    const ns = normalize(raw2.map((r) => r.shelter));
    const nm = normalize(raw2.map((r) => r.mate));
    const ne = normalize(raw2.map((r) => r.explore));
    const w = m.weights;
    return raw2.map((r, i) => {
      const danger = nd[i] ?? 0, fd = nf[i] ?? 0, sh = ns[i] ?? 0, mt = nm[i] ?? 0, ex = ne[i] ?? 0;
      const total = (w["eat"] ?? 0) * fd - (w["flee"] ?? 0) * danger + ((w["hide"] ?? 0) + (w["nest"] ?? 0)) * sh + (w["seek_mate"] ?? 0) * mt + (w["explore"] ?? 0) * ex;
      return { cell: r.cell, danger, food: fd, shelter: sh, mate: mt, explore: ex, total };
    });
  }
  __name(scoresFor, "scoresFor");
  function resolveTimers() {
    for (const f of food) {
      if (!f.present && f.respawnAt > 0 && tick >= f.respawnAt) {
        const c = freeCell((x, y) => hasHole(x, y) || hasFood(x, y) || hasTrap(x, y));
        f.x = c.x;
        f.y = c.y;
        f.present = true;
        f.respawnAt = 0;
        emit({ kind: "food_respawned", foodId: f.id, at: { x: f.x, y: f.y } });
      }
    }
    for (const t of traps) {
      if (t.occupantId !== null && tick >= t.respawnAt) {
        const c = freeCell((x, y) => hasHole(x, y) || hasFood(x, y) || hasTrap(x, y) || mice.some((m) => !m.inHole && chebyshev({ x, y }, { x: m.x, y: m.y }) < 5));
        t.x = c.x;
        t.y = c.y;
        t.occupantId = null;
        t.respawnAt = 0;
        emit({ kind: "trap_respawned", trapId: t.id, at: { x: t.x, y: t.y } });
      }
    }
    for (const c of cats) {
      if (c.pounceCooldown > 0) c.pounceCooldown--;
      if (c.mode === "eating" && tick >= c.busyUntil) {
        c.mode = "rest";
        c.target = null;
        c.bestDistance = null;
        c.busyUntil = tick + 1;
        emit({ kind: "cat_eating_ended", id: c.id });
      }
      if (c.mode === "rest" && tick >= c.busyUntil) c.mode = "prowl";
    }
    for (const m of mice) m.memories = expireMemories(m.memories, tick);
  }
  __name(resolveTimers, "resolveTimers");
  async function advance() {
    if (ended) return;
    tick++;
    resolveTimers();
    for (const m of [...mice]) {
      m.age++;
      m.nutrition -= config.nutritionDecayPerTick;
      if (m.nutrition <= 0) kill(m, "starvation");
    }
    for (const h of holes) {
      if (h.brood.length === 0) continue;
      const staying = [];
      for (const id of h.brood) {
        const pup = mice.find((m) => m.id === id);
        if (!pup) continue;
        if (pup.nutrition < NUTRITION_BANDS.fed) {
          pup.inHole = null;
          pup.isPup = false;
          emit({ kind: "hole_left", id: pup.id, holeId: h.id });
        } else staying.push(id);
      }
      h.brood = staying;
      if (h.brood.length === 0) emit({ kind: "hole_freed", holeId: h.id });
    }
    for (const m of mice) {
      if (!m.inHole || m.isPup) continue;
      if (m.nutrition < NUTRITION_BANDS.fed) {
        const h = holes.find((x) => x.id === m.inHole);
        if (h) {
          h.adult = null;
          emit({ kind: "hole_freed", holeId: h.id });
        }
        emit({ kind: "hole_left", id: m.id, holeId: m.inHole });
        m.inHole = null;
        m.intentSetAt = -TIMING.intentHold;
      }
    }
    for (const m of sortedMice()) {
      if (m.inHole || m.busyWith === "birth") continue;
      const cat = cats.find((c) => chebyshev({ x: m.x, y: m.y }, { x: c.x, y: c.y }) <= 1);
      if (cat) {
        m.intent = "flee";
        m.intentSetAt = tick;
        m.weights = { flee: 1 };
        m.busyWith = null;
        continue;
      }
      const pile = food.find((f) => f.present && f.x === m.x && f.y === m.y);
      if (pile && m.nutrition < 100 && m.busyWith !== "eat") {
        m.intent = "eat";
        m.intentSetAt = tick;
        m.busyWith = "eat";
        m.busyUntil = tick + TIMING.eat;
        m.eatingFoodId = pile.id;
      }
    }
    await decide();
    for (const m of sortedMice()) {
      if (m.inHole || m.busyWith !== null) continue;
      if (tick < m.nextMoveTick) continue;
      moveMouse(m);
    }
    for (const c of [...cats].sort(byId)) {
      if (c.mode === "eating") continue;
      moveCat(c);
    }
    finishEating();
    resolveTrapEntries();
    resolveCaptures();
    resolveCatHunger();
    resolveHoleEntries();
    resolveMating();
    resolveBirths();
    exchangeAlarms();
    resolveHungerBands();
    resolvePerception();
    emit({ kind: "tick_advanced", population: mice.length });
    if (mice.length === 0 && cats.length === 0) {
      ended = true;
      emit({ kind: "run_ended", reason: "extinct", finalTick: tick });
    } else if (tick >= config.ticks) {
      ended = true;
      emit({ kind: "run_ended", reason: "completed", finalTick: tick });
    }
  }
  __name(advance, "advance");
  const byId = /* @__PURE__ */ __name((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0, "byId");
  async function decide() {
    const ready = sortedMice().filter((m) => !m.inHole && m.busyWith === null && tick - m.intentSetAt >= intentHold(m.fear)).map((m) => m.id);
    const readyCats = [...cats].sort(byId).filter((c) => c.mode !== "eating" && (c.target === null || !mice.some((m) => m.id === c.target)) && mice.some((m) => !m.inHole && chebyshev({ x: m.x, y: m.y }, { x: c.x, y: c.y }) <= catPerception(c))).map((c) => c.id);
    if (ready.length === 0 && readyCats.length === 0) return;
    const view = world();
    const requests = composeRequests(view, [...ready, ...readyCats], () => `b${++batchNo}`);
    if (requests.length === 0) return;
    for (const r of requests) emit({ kind: "decision_requested", batchId: r.batchId, agents: r.agents });
    let answers = null;
    let failure = null;
    try {
      answers = await withTimeout(provider.decide(requests), DECISION_TIMEOUT_MS);
    } catch (err) {
      failure = err instanceof TimeoutError ? "timeout" : "error";
    }
    if (!answers) {
      for (const r of requests) {
        emit({ kind: "decision_fallback", batchId: r.batchId, reason: failure ?? "error" });
      }
      answers = applyLocalRules(requests);
    }
    for (const r of requests) {
      const batch = answers[r.batchId] ?? baselineBatch(r, tick);
      if (!failure && batch.fallbackReason !== void 0) {
        emit({
          kind: "decision_fallback",
          batchId: r.batchId,
          reason: batch.fallbackReason
        });
      }
      const subjects = batch.subjects.slice().sort((a, b) => a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0);
      emit({
        kind: "decision_returned",
        batchId: r.batchId,
        source: batch.source,
        latencyMs: batch.latencyMs,
        model: batch.model,
        inputTokens: batch.inputTokens,
        subjects
      });
      for (const s of subjects) applyDecision(s);
    }
  }
  __name(decide, "decide");
  function applyLocalRules(requests) {
    const out = {};
    for (const r of requests) out[r.batchId] = baselineBatch(r, tick);
    return out;
  }
  __name(applyLocalRules, "applyLocalRules");
  function choiceOf(s, name) {
    const answer = s.answers[name];
    return answer !== void 0 && answer.type === "choice" ? answer.choice : null;
  }
  __name(choiceOf, "choiceOf");
  const CAT_MODES = ["prowl", "stalk", "pounce", "rest"];
  const modeOf = /* @__PURE__ */ __name((label2) => CAT_MODES.includes(label2 ?? "") ? label2 : "stalk", "modeOf");
  function applyDecision(s) {
    const m = mice.find((x) => x.id === s.agentId);
    if (m) {
      m.intent = DRIVES.includes(s.intent) ? s.intent : "explore";
      m.intentSetAt = tick;
      m.weights = s.weights;
      m.fear = s.fear;
      m.decidedAt = tick;
      return;
    }
    const c = cats.find((x) => x.id === s.agentId);
    if (c) {
      const chosen = choiceOf(s, "target");
      const named = chosen === null || chosen === "none_worth_it" ? null : mice.find((x) => x.id === chosen && !x.inHole && chebyshev({ x: x.x, y: x.y }, { x: c.x, y: c.y }) <= catPerception(c));
      const mode = modeOf(choiceOf(s, "mode") ?? s.intent);
      c.target = named?.id ?? null;
      c.bestDistance = null;
      c.patience = 0;
      c.mode = named === void 0 || named === null ? mode === "rest" ? "rest" : "prowl" : mode;
      if (c.mode === "rest") c.busyUntil = Math.max(c.busyUntil, tick + TIMING.catRest);
      emit({ kind: "cat_targeted", id: c.id, target: c.target, mode: c.mode });
    }
  }
  __name(applyDecision, "applyDecision");
  const intentHold = /* @__PURE__ */ __name((fear) => fear === "panicked" ? TIMING.intentHoldPanicked : TIMING.intentHold, "intentHold");
  function moveMouse(m) {
    const scores = scoresFor(m);
    const wantsHole = m.intent === "hide" || m.intent === "nest";
    let best = null;
    let bestValue = -Infinity;
    for (const s of scores) {
      if (s.cell.x === m.x && s.cell.y === m.y) {
        const v2 = s.total + JITTER * rng.next();
        if (v2 > bestValue) {
          bestValue = v2;
          best = s;
        }
        continue;
      }
      if (occupiedByAnimal(s.cell.x, s.cell.y)) continue;
      if (cats.some((c) => c.x === s.cell.x && c.y === s.cell.y)) continue;
      const hole = holes.find((h) => h.x === s.cell.x && h.y === s.cell.y);
      if (hole && !(wantsHole && hole.adult === null && hole.brood.length === 0)) continue;
      const v = s.total + JITTER * rng.next();
      if (v > bestValue) {
        bestValue = v;
        best = s;
      }
    }
    if (!best || best.cell.x === m.x && best.cell.y === m.y) {
      m.nextMoveTick = tick + moveCost(m);
      return;
    }
    const from2 = { x: m.x, y: m.y };
    m.x = best.cell.x;
    m.y = best.cell.y;
    m.recent.push({ x: m.x, y: m.y });
    if (m.recent.length > 8) m.recent.shift();
    m.nextMoveTick = tick + moveCost(m);
    emit({ kind: "moved", id: m.id, from: from2, to: { x: m.x, y: m.y } });
  }
  __name(moveMouse, "moveMouse");
  const moveCost = /* @__PURE__ */ __name((m) => m.nutrition >= NUTRITION_BANDS.fed ? TIMING.moveFed : m.nutrition >= NUTRITION_BANDS.hungry ? TIMING.moveHungry : TIMING.moveStarving, "moveCost");
  const isHungry = /* @__PURE__ */ __name((c) => c.nutrition < CAT.hungryBelow, "isHungry");
  const catPerception = /* @__PURE__ */ __name((c) => isHungry(c) ? CAT.perceptionHungry : CAT.perception, "catPerception");
  const catPounceRange = /* @__PURE__ */ __name((c) => isHungry(c) ? CAT.pounceRangeHungry : CAT.pounceRange, "catPounceRange");
  const catPounceCooldown = /* @__PURE__ */ __name((c) => isHungry(c) ? CAT.pounceCooldownHungry : CAT.pounceCooldown, "catPounceCooldown");
  function resolveCatHunger() {
    const dying = [];
    for (const c of [...cats].sort(byId)) {
      c.nutrition = Math.max(0, c.nutrition - CAT.decayPerTick);
      if (c.nutrition <= 0) dying.push(c);
    }
    for (const c of dying) {
      emit({
        kind: "cat_died",
        id: c.id,
        cause: "starvation",
        nutrition: Math.round(c.nutrition * 100) / 100,
        at: { x: c.x, y: c.y }
      });
      cats = cats.filter((o) => o.id !== c.id);
    }
  }
  __name(resolveCatHunger, "resolveCatHunger");
  function moveCat(c) {
    if (tick < c.busyUntil) return;
    const target = c.target ? mice.find((m) => m.id === c.target && !m.inHole) : void 0;
    if (c.target && !target) {
      c.lastSighting = c.lastSighting ?? null;
      c.sightingUntil = tick + TIMING.catReturnToSighting;
      const restless = isHungry(c);
      c.target = null;
      c.mode = restless ? "prowl" : "rest";
      if (!restless) c.busyUntil = tick + TIMING.catRest;
      emit({ kind: "cat_targeted", id: c.id, target: null, mode: c.mode });
      return;
    }
    if (target) {
      const d = chebyshev({ x: c.x, y: c.y }, { x: target.x, y: target.y });
      if (c.bestDistance === null || d < c.bestDistance) {
        c.bestDistance = d;
        c.patience = 0;
      } else c.patience++;
      if (c.patience >= TIMING.catPatience) {
        c.lastSighting = { x: target.x, y: target.y };
        c.sightingUntil = tick + TIMING.catReturnToSighting;
        c.target = null;
        c.mode = "prowl";
        c.bestDistance = null;
        c.patience = 0;
        emit({ kind: "cat_targeted", id: c.id, target: null, mode: "prowl" });
        return;
      }
      if (d <= catPounceRange(c) && c.pounceCooldown === 0) {
        const from2 = { x: c.x, y: c.y };
        stepToward(c, target.x, target.y, 2);
        c.pounceCooldown = catPounceCooldown(c);
        c.mode = "pounce";
        emit({ kind: "cat_pounced", id: c.id, target: target.id, from: from2, to: { x: c.x, y: c.y } });
        return;
      }
      c.mode = "stalk";
      c.lastSighting = { x: target.x, y: target.y };
      stepToward(c, target.x, target.y, 1);
      return;
    }
    if (c.mode === "rest") return;
    if (c.lastSighting && tick < c.sightingUntil) {
      stepToward(c, c.lastSighting.x, c.lastSighting.y, 1);
      if (c.x === c.lastSighting.x && c.y === c.lastSighting.y) c.lastSighting = null;
      return;
    }
    if (c.drift.dx === 0 && c.drift.dy === 0 || rng.next() < 0.1) {
      c.drift = { dx: rng.int(3) - 1, dy: rng.int(3) - 1 };
    }
    stepToward(c, c.x + c.drift.dx * 3, c.y + c.drift.dy * 3, 1);
    c.mode = "prowl";
  }
  __name(moveCat, "moveCat");
  function stepToward(c, tx, ty, steps) {
    for (let i = 0; i < steps; i++) {
      const dx = Math.sign(tx - c.x), dy = Math.sign(ty - c.y);
      const nx = Math.max(0, Math.min(width - 1, c.x + dx));
      const ny = Math.max(0, Math.min(height - 1, c.y + dy));
      if (nx === c.x && ny === c.y) return;
      if (holes.some((h) => h.x === nx && h.y === ny)) return;
      if (cats.some((o) => o.id !== c.id && o.x === nx && o.y === ny)) return;
      const from2 = { x: c.x, y: c.y };
      c.x = nx;
      c.y = ny;
      emit({ kind: "moved", id: c.id, from: from2, to: { x: c.x, y: c.y } });
    }
  }
  __name(stepToward, "stepToward");
  function finishEating() {
    for (const m of sortedMice()) {
      if (m.busyWith !== "eat" || tick < m.busyUntil) continue;
      const pile = food.find((f) => f.id === m.eatingFoodId);
      m.busyWith = null;
      m.eatingFoodId = null;
      if (!pile || !pile.present) continue;
      pile.present = false;
      pile.respawnAt = config.foodRespawnTicks > 0 ? tick + config.foodRespawnTicks : 0;
      m.nutrition = 100;
      emit({ kind: "food_eaten", id: m.id, foodId: pile.id });
    }
  }
  __name(finishEating, "finishEating");
  function resolveTrapEntries() {
    for (const m of sortedMice()) {
      if (m.inHole) continue;
      const t = traps.find((x) => x.occupantId === null && x.x === m.x && x.y === m.y);
      if (!t) continue;
      emit({ kind: "trap_entered", id: m.id, trapId: t.id });
      const chance = 0.5 * (m.nutrition / 100);
      const evaded = rng.next() < chance;
      emit({
        kind: "evasion_rolled",
        id: m.id,
        trapId: t.id,
        nutrition: m.nutrition,
        chance,
        evaded
      });
      if (evaded) {
        witness("narrow_escape", { x: t.x, y: t.y }, [m.id]);
        continue;
      }
      t.occupantId = m.id;
      t.respawnAt = tick + TIMING.trapOccupied;
      emit({ kind: "mouse_trapped", id: m.id, trapId: t.id });
      kill(m, "trap", { x: t.x, y: t.y });
    }
  }
  __name(resolveTrapEntries, "resolveTrapEntries");
  function resolveHungerBands() {
    for (const m of sortedMice()) {
      const now = hungerBand(m.nutrition);
      if (now === m.band) continue;
      emit({
        kind: "hunger_changed",
        id: m.id,
        subject: "mouse",
        from: m.band,
        to: now
      });
      m.band = now;
    }
    for (const c of [...cats].sort(byId)) {
      const now = catBand(c.nutrition);
      if (now === c.band) continue;
      emit({
        kind: "hunger_changed",
        id: c.id,
        subject: "cat",
        from: c.band,
        to: now
      });
      c.band = now;
    }
  }
  __name(resolveHungerBands, "resolveHungerBands");
  function resolvePerception() {
    refreshCache();
    for (const m of sortedMice()) {
      if (m.inHole) {
        m.seen = [];
        continue;
      }
      const here = { x: m.x, y: m.y };
      const r = perceptionOf(m);
      const now = [];
      for (const f of food) {
        if (!f.present) continue;
        const d = chebyshev(here, { x: f.x, y: f.y });
        if (d <= r) now.push({ id: f.id, what: "food", distance: d });
      }
      for (const x of traps) {
        const d = chebyshev(here, { x: x.x, y: x.y });
        if (d <= r) now.push({ id: x.id, what: "trap", distance: d });
      }
      for (const c of cats) {
        const d = chebyshev(here, { x: c.x, y: c.y });
        if (d <= r) now.push({ id: c.id, what: "cat", distance: d });
      }
      m.seen = report(m.id, m.seen, now);
    }
    for (const c of [...cats].sort(byId)) {
      const here = { x: c.x, y: c.y };
      const r = catPerception(c);
      const now = sortedMice().filter((m) => !m.inHole).map((m) => ({
        id: m.id,
        what: "mouse",
        distance: chebyshev(here, { x: m.x, y: m.y })
      })).filter((x) => x.distance <= r);
      c.seen = report(c.id, c.seen, now);
    }
  }
  __name(resolvePerception, "resolvePerception");
  function report(watcher, before, now) {
    const had = new Set(before);
    for (const x of now) {
      if (had.has(x.id)) continue;
      emit({
        kind: "spotted",
        id: watcher,
        what: x.what,
        targetId: x.id,
        distance: x.distance
      });
    }
    return now.map((x) => x.id).sort();
  }
  __name(report, "report");
  function resolveCaptures() {
    for (const c of [...cats].sort(byId)) {
      if (c.mode === "eating") continue;
      const prey = sortedMice().find((m) => !m.inHole && m.x === c.x && m.y === c.y);
      if (!prey) continue;
      emit({ kind: "capture", catId: c.id, mouseId: prey.id });
      kill(prey, "cat", { x: c.x, y: c.y });
      c.mode = "eating";
      c.busyUntil = tick + TIMING.catEat;
      c.target = null;
      emit({ kind: "cat_eating_started", id: c.id });
      const restored = Math.min(CAT.mealRestores, CAT.startingNutrition - c.nutrition);
      c.nutrition = Math.min(CAT.startingNutrition, c.nutrition + CAT.mealRestores);
      emit({
        kind: "cat_fed",
        id: c.id,
        restored: Math.round(restored * 100) / 100,
        nutrition: Math.round(c.nutrition * 100) / 100
      });
    }
  }
  __name(resolveCaptures, "resolveCaptures");
  function resolveHoleEntries() {
    for (const m of sortedMice()) {
      if (m.inHole || m.isPup || m.busyWith !== null) continue;
      if (m.intent !== "hide" && m.intent !== "nest") continue;
      const h = holes.find((x) => x.x === m.x && x.y === m.y && x.adult === null && x.brood.length === 0);
      if (!h) continue;
      if (m.intent === "nest" && m.pregnantSince !== null && tick - m.pregnantSince >= TIMING.gestation) {
        m.busyWith = "birth";
        m.busyUntil = tick + TIMING.birth;
        continue;
      }
      h.adult = m.id;
      m.inHole = h.id;
      emit({ kind: "hole_entered", id: m.id, holeId: h.id, as: "adult" });
    }
  }
  __name(resolveHoleEntries, "resolveHoleEntries");
  function resolveMating() {
    for (const m of sortedMice()) {
      if (m.intent !== "seek_mate" || m.inHole || m.busyWith !== null) continue;
      if (m.age < TIMING.juvenile || m.pregnantSince !== null) continue;
      const partner = sortedMice().find((o) => o.id !== m.id && o.sex !== m.sex && !o.inHole && o.busyWith === null && o.age >= TIMING.juvenile && o.pregnantSince === null && o.intent !== "eat" && o.intent !== "flee" && chebyshev({ x: m.x, y: m.y }, { x: o.x, y: o.y }) <= 1);
      if (!partner) continue;
      const hole = holes.find((h) => h.adult === null && h.brood.length === 0 && chebyshev({ x: m.x, y: m.y }, { x: h.x, y: h.y }) <= 3);
      if (!hole) continue;
      m.busyWith = "mate";
      m.busyUntil = tick + TIMING.mate;
      partner.busyWith = "mate";
      partner.busyUntil = tick + TIMING.mate;
      const female = m.sex === "female" ? m : partner;
      female.pregnantSince = tick;
      emit({ kind: "mating", a: m.id, b: partner.id, holeId: hole.id });
      emit({ kind: "gestation_started", id: female.id });
    }
  }
  __name(resolveMating, "resolveMating");
  function resolveBirths() {
    for (const m of sortedMice()) {
      if (m.busyWith === "mate" && tick >= m.busyUntil) m.busyWith = null;
      if (m.busyWith !== "birth" || tick < m.busyUntil) continue;
      m.busyWith = null;
      const hole = holes.find((h) => h.x === m.x && h.y === m.y && h.adult === null && h.brood.length === 0);
      if (!hole) {
        m.intentSetAt = -TIMING.intentHold;
        continue;
      }
      const litter = 2 + rng.int(3);
      const pups = [];
      for (let i = 0; i < litter; i++) {
        if (mice.length >= caps.mice) {
          emit({ kind: "cap_limited_birth", motherId: m.id, lost: litter - i });
          break;
        }
        const sex = rng.next() < 0.5 ? "male" : "female";
        const personality = drawPersonality(config, rng.next());
        const pup = newMouse(
          `m${pad(nextMouse++)}`,
          sex,
          personality,
          { x: hole.x, y: hole.y },
          PUP_NUTRITION,
          true
        );
        pup.inHole = hole.id;
        mice.push(pup);
        miceVersion++;
        pups.push(pup.id);
        emit({ kind: "birth", motherId: m.id, pupId: pup.id, personality, sex });
      }
      if (pups.length > 0) {
        hole.brood = pups;
        emit({ kind: "brood_born", holeId: hole.id, motherId: m.id, pups });
      }
      m.pregnantSince = null;
      const away = NEIGHBOURS.slice(1).map((n) => ({ x: m.x + n.dx, y: m.y + n.dy })).find((c) => c.x >= 0 && c.x < width && c.y >= 0 && c.y < height && !occupiedByAnimal(c.x, c.y) && !holes.some((h) => h.x === c.x && h.y === c.y));
      if (away) {
        m.x = away.x;
        m.y = away.y;
      }
      m.intentSetAt = -TIMING.intentHold;
    }
  }
  __name(resolveBirths, "resolveBirths");
  function exchangeAlarms() {
    for (const a of sortedMice()) {
      if (a.inHole) continue;
      const range = a.personality === "social" ? ALARM_RANGE.social : ALARM_RANGE.normal;
      for (const b of sortedMice()) {
        if (b.id <= a.id || b.inHole) continue;
        if (chebyshev({ x: a.x, y: a.y }, { x: b.x, y: b.y }) > range) continue;
        const last = a.alarmedAt[b.id] ?? -9999;
        if (tick - last < 50) continue;
        a.alarmedAt[b.id] = tick;
        b.alarmedAt[a.id] = tick;
        share(a, b);
        share(b, a);
      }
    }
  }
  __name(exchangeAlarms, "exchangeAlarms");
  function share(from2, to) {
    const mem = freshestSeen(from2.memories);
    if (!mem) return;
    if (to.memories.some((x) => x.at.x === mem.at.x && x.at.y === mem.at.y)) return;
    const sentence = sentenceFor(mem.kind, mem.bearing, tick - mem.addedAt, "heard");
    to.memories = addMemory(to.memories, {
      sentence,
      provenance: "heard",
      addedAt: tick,
      bearing: mem.bearing,
      at: mem.at,
      kind: mem.kind
    });
    emit({
      kind: "alarm_exchanged",
      from: from2.id,
      to: to.id,
      sentence,
      senderProvenance: mem.provenance
    });
    emit({
      kind: "memory_added",
      id: to.id,
      sentence,
      provenance: "heard",
      bearing: mem.bearing
    });
  }
  __name(share, "share");
  function witness(kind, at2, only) {
    for (const m of sortedMice()) {
      if (only && !only.includes(m.id)) continue;
      if (!only && chebyshev({ x: m.x, y: m.y }, at2) > perceptionOf(m)) continue;
      const bearing = bearingFrom({ x: m.x, y: m.y }, at2);
      const sentence = sentenceFor(kind, bearing, 0, "seen");
      m.memories = addMemory(m.memories, {
        sentence,
        provenance: "seen",
        addedAt: tick,
        bearing,
        at: { ...at2 },
        kind
      });
      emit({ kind: "memory_added", id: m.id, sentence, provenance: "seen", bearing });
    }
  }
  __name(witness, "witness");
  function kill(m, cause, at2) {
    if (!mice.some((x) => x.id === m.id)) return;
    mice = mice.filter((x) => x.id !== m.id);
    miceVersion++;
    for (const h of holes) {
      if (h.adult === m.id) {
        h.adult = null;
        emit({ kind: "hole_freed", holeId: h.id });
      }
      if (h.brood.includes(m.id)) h.brood = h.brood.filter((x) => x !== m.id);
    }
    emit({ kind: "death", id: m.id, cause });
    if (cause === "trap") witness("trap_death", at2 ?? { x: m.x, y: m.y });
    if (cause === "cat") witness("cat_kill", at2 ?? { x: m.x, y: m.y });
  }
  __name(kill, "kill");
  function world() {
    return {
      tick,
      width,
      height,
      mice: sortedMice().map((m) => ({
        id: m.id,
        sex: m.sex,
        personality: m.personality,
        nutrition: m.nutrition,
        age: m.age,
        at: { x: m.x, y: m.y },
        inHole: m.inHole,
        intent: m.intent,
        memories: m.memories.map((x) => ({ ...x })),
        pregnantSince: m.pregnantSince,
        fear: m.fear
      })),
      cats: [...cats].sort(byId).map((c) => ({
        id: c.id,
        at: { x: c.x, y: c.y },
        mode: c.mode,
        target: c.target,
        pounceCooldown: c.pounceCooldown,
        patience: c.patience,
        lastSighting: c.lastSighting ? { ...c.lastSighting } : null,
        nutrition: c.nutrition,
        hungry: isHungry(c)
      })),
      food: food.map((f) => ({ id: f.id, at: { x: f.x, y: f.y }, present: f.present })),
      traps: traps.map((t) => ({ id: t.id, at: { x: t.x, y: t.y }, occupantId: t.occupantId })),
      holes: holes.map((h) => ({
        id: h.id,
        at: { x: h.x, y: h.y },
        occupancy: h.adult ? "adult" : h.brood.length > 0 ? "brood" : "empty"
      }))
    };
  }
  __name(world, "world");
  return {
    step: advance,
    run: /* @__PURE__ */ __name(async (n) => {
      for (let i = 0; i < n && !ended; i++) await advance();
    }, "run"),
    world,
    events: /* @__PURE__ */ __name(() => buffer, "events"),
    drain: /* @__PURE__ */ __name(() => {
      const out = buffer;
      buffer = [];
      return out;
    }, "drain"),
    serialize: /* @__PURE__ */ __name(() => JSON.parse(JSON.stringify({
      version: 1,
      tick,
      seq,
      seed,
      engineVersion: ENGINE_VERSION,
      config,
      rng: rng.state(),
      mice,
      cats,
      food,
      traps,
      holes,
      nextMouse,
      ended,
      batchNo
    })), "serialize"),
    candidateScores: /* @__PURE__ */ __name((id) => {
      const m = mice.find((x) => x.id === id);
      if (!m) throw new Error(`no mouse ${id}`);
      return scoresFor(m);
    }, "candidateScores"),
    setFear: /* @__PURE__ */ __name((id, fear) => {
      const m = mice.find((x) => x.id === id);
      if (m) m.fear = fear;
    }, "setFear"),
    intentHoldFor: intentHold
  };
}
__name(build, "build");
var TimeoutError = class extends Error {
  static {
    __name(this, "TimeoutError");
  }
};
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError("decision timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    );
  });
}
__name(withTimeout, "withTimeout");

// ../../packages/engine/src/narrate.ts
var CHANGES_POPULATION = /* @__PURE__ */ new Set([
  "death",
  "capture",
  "mouse_trapped",
  "birth",
  "mating",
  "cat_died",
  "cap_limited_birth"
]);
var at = /* @__PURE__ */ __name((c) => `${String(c.x)}, ${String(c.y)}`, "at");
function narrate(e) {
  const said = /* @__PURE__ */ __name((text, subject) => subject === void 0 ? { kind: e.kind, text } : { kind: e.kind, text, subject }, "said");
  switch (e.kind) {
    case "death":
      return e.cause === "starvation" ? said(`${e.id} starved.`, e.id) : said(`${e.id} died.`, e.id);
    case "capture":
      return said(`${e.mouseId} was caught by ${e.catId}.`, e.mouseId);
    case "mouse_trapped":
      return said(`${e.id} died in ${e.trapId}.`, e.id);
    case "cat_died":
      return said(`${e.id} starved, with nothing left to catch.`, e.id);
    case "birth":
      return said(
        `${e.pupId} was born to ${e.motherId}, ${e.personality} and ${e.sex}.`,
        e.pupId
      );
    case "brood_born":
      return said(
        `${e.motherId} delivered ${String(e.pups.length)} in ${e.holeId}.`,
        e.motherId
      );
    case "mating":
      return said(`${e.a} and ${e.b} mated in ${e.holeId}.`, e.a);
    case "cap_limited_birth":
      return said(`${String(e.lost)} of ${e.motherId}'s litter had nowhere to go; the world is full.`, e.motherId);
    case "gestation_started":
      return said(`${e.id} is carrying a litter.`, e.id);
    case "spotted":
      return said(`${e.id} spotted ${e.what} ${e.targetId}, ${String(e.distance)} away.`, e.id);
    case "hunger_changed":
      return said(`${e.id} went from ${e.from} to ${e.to}.`, e.id);
    case "food_eaten":
      return said(`${e.id} ate ${e.foodId}.`, e.id);
    case "food_respawned":
      return said(`${e.foodId} grew back at ${at(e.at)}.`);
    case "trap_entered":
      return said(`${e.id} walked into ${e.trapId}.`, e.id);
    case "evasion_rolled":
      return said(`${e.id} ${e.evaded ? "slipped out of" : "was held by"} ${e.trapId} on a ${String(Math.round(e.chance * 100))} percent chance.`, e.id);
    case "trap_respawned":
      return said(`${e.trapId} was reset at ${at(e.at)}.`);
    case "cat_eating_started":
      return said(`${e.id} started eating.`, e.id);
    case "cat_eating_ended":
      return said(`${e.id} finished eating.`, e.id);
    case "cat_fed":
      return said(`${e.id} was fed ${String(e.restored)}, now at ${String(e.nutrition)} percent.`, e.id);
    case "cat_targeted":
      return said(`${e.id} ${e.target === null ? "gave up its target" : `is after ${e.target}`}, now ${e.mode}.`, e.id);
    case "cat_pounced":
      return said(`${e.id} pounced at ${e.target}.`, e.id);
    case "hole_entered":
      return said(`${e.id} went into ${e.holeId} as ${e.as}.`, e.id);
    case "hole_left":
      return said(`${e.id} came out of ${e.holeId}.`, e.id);
    case "hole_freed":
      return said(`${e.holeId} is free again.`);
    case "memory_added":
      return said(`${e.id} remembers: ${e.sentence}`, e.id);
    case "alarm_exchanged":
      return said(`${e.from} warned ${e.to}: ${e.sentence}`, e.from);
    case "decision_returned":
      return said(`${String(e.subjects.length)} decided by ${e.source === "jev" ? "Jev" : "the rules"}: ` + e.subjects.map((x) => `${x.agentId} ${x.intent}`).join(", ") + ".");
    case "decision_fallback":
      return said(`A batch fell back to the rules: ${e.reason}.`);
    case "run_ended":
      return said(e.reason === "extinct" ? `Total extinction at turn ${String(e.finalTick)}: nothing left alive.` : `The run ended, ${e.reason}, at turn ${String(e.finalTick)}.`);
    default:
      return said(e.kind);
  }
}
__name(narrate, "narrate");

// ../sim/src/types.ts
var SPEED = {
  slowest: 1,
  /** A full-length run in about a minute, which is as fast as is worth watching. */
  fastest: 334
};

// ../sim/src/index.ts
var CHUNK_TICKS = 250;
var CHUNK_BYTES = 8 * 1024 * 1024;
var FRAMES_PER_SECOND = 20;
var FRAME_EVERY_TICKS = 5;
var FRAME_BATCH = 4;
var FRAME_FLUSH_MS = 100;
var KIND_OF = {
  death: "starved",
  capture: "eaten",
  mouse_trapped: "trapped",
  birth: "born",
  mating: "mated",
  cat_died: "cat_starved",
  cap_limited_birth: "birth_lost"
};
var YIELD_EVERY_TICKS = 8;
var PACE_NAP_MS = 4;
var utf8 = new TextEncoder();
async function gzip(bytes) {
  const source = new ReadableStream({
    start(c) {
      c.enqueue(bytes);
      c.close();
    }
  });
  const gz = new CompressionStream("gzip");
  return new Uint8Array(await new Response(source.pipeThrough(gz)).arrayBuffer());
}
__name(gzip, "gzip");
function dueForFrame(o) {
  if (o.stepped) return true;
  if (o.every > 0 && o.tick % o.every === 0) return true;
  return o.msSinceLastFrame >= 1e3 / FRAMES_PER_SECOND;
}
__name(dueForFrame, "dueForFrame");
var encode = /* @__PURE__ */ __name(async (v) => {
  const bytes = utf8.encode(JSON.stringify(v));
  return { raw: bytes.byteLength, gzip: await gzip(bytes) };
}, "encode");
var processId = /* @__PURE__ */ __name(() => globalThis.process?.pid ?? 0, "processId");
var sleep = /* @__PURE__ */ __name((ms) => new Promise((r) => setTimeout(r, ms)), "sleep");
var wallClock = /* @__PURE__ */ __name(() => Date.now(), "wallClock");
function createSimulation(opts) {
  const now = opts.now ?? wallClock;
  let engine = null;
  let tick = 0;
  let chunkSeq = 0;
  let chunkFirstTick = 1;
  let buffered = [];
  let bufferedBytes = 0;
  let points = [];
  let pendingFrames = [];
  let pendingLog = [];
  const lastDecision = /* @__PURE__ */ new Map();
  let control = { desired: "run", speed: 0, seq: -1 };
  let engineEnded = null;
  let stepsOwed = 0;
  let allowance = { tokens: 0, degraded: true, reason: "disabled" };
  let presigned = null;
  const extent = /* @__PURE__ */ __name((n) => ({ peak: n, min: n, current: n }), "extent");
  const widen = /* @__PURE__ */ __name((e, n) => {
    e.current = n;
    if (n > e.peak) e.peak = n;
    if (n < e.min) e.min = n;
  }, "widen");
  const totals = {
    currentTick: 0,
    requests: 0,
    inputTokens: 0,
    fallbackCount: 0,
    population: { mice: extent(0), cats: extent(0) }
  };
  let sinceChunk = { requests: 0, inputTokens: 0, fallbacks: 0, model: null };
  function applyAck(ack) {
    if (ack.control.seq >= control.seq) control = ack.control;
    const changed = ack.allowance.degraded !== allowance.degraded;
    allowance = ack.allowance;
    presigned = ack.presigned;
    if (changed) rebuildProvider();
  }
  __name(applyAck, "applyAck");
  let provider = null;
  function rebuildProvider() {
    provider = opts.provider(allowance);
  }
  __name(rebuildProvider, "rebuildProvider");
  const currentProvider = /* @__PURE__ */ __name(() => provider ??= opts.provider(allowance), "currentProvider");
  const forwarding = {
    decide: /* @__PURE__ */ __name((requests) => currentProvider().decide(requests), "decide")
  };
  function logFrom(events, atTick) {
    for (const e of events) {
      if (!CHANGES_POPULATION.has(e.kind)) continue;
      if (e.kind === "death" && e.cause !== "starvation") continue;
      const said = narrate(e);
      const d = said.subject === void 0 ? void 0 : lastDecision.get(said.subject);
      pendingLog.push({
        seq: e.seq,
        tick: atTick,
        kind: KIND_OF[e.kind] ?? "starved",
        subject: said.subject ?? "",
        text: said.text,
        ...d === void 0 ? {} : { decision: d.intent, decidedBy: d.source }
      });
    }
  }
  __name(logFrom, "logFrom");
  function accumulate(events) {
    for (const e of events) {
      if (e.kind === "decision_returned") {
        for (const s of e.subjects) {
          lastDecision.set(s.agentId, { intent: s.intent, source: e.source });
        }
        if (e.source === "jev") {
          sinceChunk.requests += 1;
          sinceChunk.inputTokens += e.inputTokens ?? 0;
          sinceChunk.model = e.model ?? sinceChunk.model;
        } else {
          sinceChunk.fallbacks += 1;
        }
      }
    }
  }
  __name(accumulate, "accumulate");
  function summarize(events, atTick) {
    const view = engine?.world();
    const alive = view?.mice.filter((m) => !m.inHole) ?? [];
    const mean = alive.length === 0 ? 0 : alive.reduce((t, m) => t + m.nutrition, 0) / alive.length;
    const deaths = { starvation: 0, trap: 0, cat: 0 };
    let births = 0;
    let judged = 0;
    let fallbacks = 0;
    for (const e of events) {
      if (e.kind === "death") deaths[e.cause] += 1;
      if (e.kind === "birth") births += 1;
      if (e.kind === "decision_returned") e.source === "jev" ? judged++ : fallbacks++;
    }
    widen(totals.population.mice, view?.mice.length ?? 0);
    widen(totals.population.cats, view?.cats.length ?? 0);
    points.push({
      tick: atTick,
      population: view?.mice.length ?? 0,
      cats: view?.cats.length ?? 0,
      food: view?.food.filter((f) => f.present).length ?? 0,
      traps: view?.traps.filter((x) => x.occupantId === null).length ?? 0,
      births,
      deathsByStarvation: deaths.starvation,
      deathsByTrap: deaths.trap,
      deathsByCat: deaths.cat,
      meanNutrition: Math.round(mean * 100) / 100,
      judged,
      fallbacks
    });
  }
  __name(summarize, "summarize");
  function frameNow() {
    const w = engine?.world();
    return {
      tick,
      population: w?.mice.length ?? 0,
      mice: (w?.mice ?? []).map((m) => ({
        id: m.id,
        x: m.at.x,
        y: m.at.y,
        nutrition: Math.round(m.nutrition),
        intent: m.intent,
        fear: m.fear,
        inHole: m.inHole !== null,
        hungry: hungerBand(m.nutrition) !== "fed"
      })),
      cats: (w?.cats ?? []).map((c) => ({
        id: c.id,
        x: c.at.x,
        y: c.at.y,
        mode: c.mode,
        nutrition: Math.round(c.nutrition),
        hungry: c.hungry
      })),
      food: (w?.food ?? []).filter((f) => f.present).map((f) => ({ id: f.id, x: f.at.x, y: f.at.y })),
      traps: (w?.traps ?? []).map((t) => ({
        id: t.id,
        x: t.at.x,
        y: t.at.y,
        occupied: t.occupantId !== null
      })),
      holes: (w?.holes ?? []).map((h) => ({
        id: h.id,
        x: h.at.x,
        y: h.at.y,
        occupancy: h.occupancy
      }))
    };
  }
  __name(frameNow, "frameNow");
  let lastFrameFlush = 0;
  let lastFrameAt = 0;
  async function flushFrames() {
    lastFrameFlush = now();
    if (pendingFrames.length === 0 && pendingLog.length === 0) return;
    const batch = pendingFrames;
    const log = pendingLog;
    pendingFrames = [];
    pendingLog = [];
    await opts.coordinator.frames(batch, log);
  }
  __name(flushFrames, "flushFrames");
  async function closeChunk() {
    if (presigned === null) throw new Error("no upload grant");
    const chunkBody = {
      runId: opts.runId,
      seq: chunkSeq,
      firstTick: chunkFirstTick,
      lastTick: tick,
      events: buffered
    };
    const summaryBody = { runId: opts.runId, seq: chunkSeq, points };
    const snapshot = engine?.serialize() ?? { version: 1, tick };
    const chunk2 = await encode(chunkBody);
    const summary = await encode(summaryBody);
    const snap = await encode(snapshot);
    await opts.upload(presigned.chunk, chunk2.gzip);
    await opts.upload(presigned.summary, summary.gzip);
    await opts.upload(presigned.snapshot, snap.gzip);
    totals.currentTick = tick;
    totals.requests += sinceChunk.requests;
    totals.inputTokens += sinceChunk.inputTokens;
    totals.fallbackCount += sinceChunk.fallbacks;
    const report = {
      seq: chunkSeq,
      firstTick: chunkFirstTick,
      lastTick: tick,
      eventCount: buffered.length,
      bytesRaw: chunk2.raw,
      bytesGzip: chunk2.gzip.byteLength,
      usage: { ...sinceChunk },
      totals: snapshotTotals()
    };
    const ack = await opts.coordinator.chunk(report);
    chunkSeq += 1;
    chunkFirstTick = tick + 1;
    buffered = [];
    bufferedBytes = 0;
    points = [];
    sinceChunk = { requests: 0, inputTokens: 0, fallbacks: 0, model: null };
    applyAck(ack);
  }
  __name(closeChunk, "closeChunk");
  function snapshotTotals() {
    return {
      ...totals,
      population: {
        mice: { ...totals.population.mice },
        cats: { ...totals.population.cats }
      }
    };
  }
  __name(snapshotTotals, "snapshotTotals");
  const limit = opts.config.ticks;
  async function loop(ceiling) {
    let sinceYield = 0;
    let credit = 0;
    let lastPaced = now();
    let holding = false;
    while (tick < limit && tick < ceiling && control.desired !== "stop") {
      if (control.desired === "pause" && stepsOwed === 0) {
        if (!holding) {
          holding = true;
          pendingFrames.push(frameNow());
        }
        await flushFrames();
        credit = 0;
        lastPaced = now();
        await sleep(5);
        continue;
      }
      holding = false;
      let stepped = false;
      if (stepsOwed > 0) {
        stepsOwed -= 1;
        stepped = true;
        credit = 0;
        lastPaced = now();
      } else if (control.speed > 0) {
        const at2 = now();
        credit += (at2 - lastPaced) * control.speed / 1e3;
        lastPaced = at2;
        if (credit < 1) {
          await sleep(PACE_NAP_MS);
          continue;
        }
        credit -= 1;
        credit = Math.min(credit, control.speed);
      }
      await engine?.step();
      tick += 1;
      const fresh = engine?.drain() ?? [];
      accumulate(fresh);
      logFrom(fresh, tick);
      for (const e of fresh) {
        if (e.kind === "run_ended" && e.reason === "extinct") engineEnded = "extinct";
        else if (e.kind === "run_ended") engineEnded = "completed";
      }
      summarize(fresh, tick);
      buffered.push(...fresh);
      bufferedBytes += fresh.length * 200;
      const every = control.speed > 0 ? Math.max(1, Math.round(control.speed / FRAMES_PER_SECOND)) : FRAME_EVERY_TICKS;
      if (dueForFrame({ tick, every, stepped, msSinceLastFrame: now() - lastFrameAt })) {
        pendingFrames.push(frameNow());
        lastFrameAt = now();
      }
      const waiting = pendingFrames.length + pendingLog.length;
      if (stepped || pendingFrames.length >= FRAME_BATCH || waiting > 0 && now() - lastFrameFlush >= FRAME_FLUSH_MS) {
        await flushFrames();
      }
      if (tick - chunkFirstTick + 1 >= CHUNK_TICKS || bufferedBytes >= CHUNK_BYTES) {
        await flushFrames();
        await closeChunk();
      }
      if (++sinceYield >= YIELD_EVERY_TICKS) {
        sinceYield = 0;
        await sleep(0);
      }
      if (engineEnded !== null) break;
    }
  }
  __name(loop, "loop");
  return {
    currentTick: /* @__PURE__ */ __name(() => tick, "currentTick"),
    control(c) {
      if (c.seq <= control.seq) return;
      if (c.desired === "step") {
        control = { ...c, desired: "pause" };
        stepsOwed += 1;
        return;
      }
      control = c;
    },
    async start(o = {}) {
      const ceiling = o.until ?? Number.POSITIVE_INFINITY;
      try {
        if (o.snapshot) {
          engine = restore(o.snapshot, { provider: forwarding });
          tick = engine.world().tick;
          chunkFirstTick = tick + 1;
        } else {
          engine = createEngine({ config: opts.config, seed: opts.seed, provider: forwarding });
          chunkFirstTick = 1;
        }
        opts.onEngine?.(engine);
        if (o.totals) {
          totals.requests = o.totals.requests;
          totals.inputTokens = o.totals.inputTokens;
          totals.fallbackCount = o.totals.fallbackCount;
          totals.population = {
            mice: { ...o.totals.population.mice },
            cats: { ...o.totals.population.cats }
          };
        }
        totals.currentTick = tick;
        const opening = engine.world();
        if (o.totals) {
          widen(totals.population.mice, opening.mice.length);
          widen(totals.population.cats, opening.cats.length);
        } else {
          totals.population.mice = extent(opening.mice.length);
          totals.population.cats = extent(opening.cats.length);
        }
        applyAck(await opts.coordinator.ready({
          engineVersion: ENGINE_VERSION,
          pid: processId(),
          ...o.snapshot ? { resumedFromTick: tick } : {}
        }));
        await loop(ceiling);
        pendingFrames.push(frameNow());
        await flushFrames();
        if (buffered.length > 0 || points.length > 0) await closeChunk();
        if (tick < limit && control.desired !== "stop" && engineEnded === null) {
          return { finished: false, tick };
        }
        await opts.coordinator.done({
          finalTick: tick,
          totals: snapshotTotals(),
          reason: engineEnded ?? (control.desired === "stop" ? "stopped" : "completed")
        });
        return { finished: true, tick };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await opts.coordinator.failed({ atTick: tick, reason });
        return { finished: true, tick };
      }
    }
  };
}
__name(createSimulation, "createSimulation");

// ../../packages/provider-jev/src/index.ts
var DEFAULT_TIMEOUT_MS = 2e3;
var isChoice = /* @__PURE__ */ __name((a) => typeof a === "object" && a !== null && a.type === "choice", "isChoice");
var isScore = /* @__PURE__ */ __name((a) => typeof a === "object" && a !== null && a.type === "score", "isScore");
function weightsFrom(probabilities) {
  const entries = Object.entries(probabilities).filter(([, v]) => Number.isFinite(v) && v > 0);
  const total = entries.reduce((t, [, v]) => t + v, 0);
  if (entries.length === 0 || total <= 0) return { explore: 1 };
  return Object.fromEntries(entries.map(([k, v]) => [k, v / total]));
}
__name(weightsFrom, "weightsFrom");
function jevProvider(client, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = opts.now ?? (() => Date.now());
  async function one(req) {
    const started = now();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const result = await client.systemOne(
        {
          state: req.state,
          questions: req.questions,
          ...opts.model === void 0 ? {} : { model: opts.model }
        },
        { signal: controller.signal, timeout: timeoutMs }
      );
      const subjects = req.agents.map((id) => subjectFor(req, id, result.answers));
      const batch = {
        subjects,
        source: "jev",
        latencyMs: Math.max(0, now() - started),
        model: result.model,
        ...result.usage === void 0 ? {} : { inputTokens: result.usage.input_tokens }
      };
      return batch;
    } catch {
      return {
        ...baselineBatch(req, 0),
        latencyMs: Math.max(0, now() - started),
        fallbackReason: controller.signal.aborted ? "timeout" : "error"
      };
    } finally {
      clearTimeout(timer);
    }
  }
  __name(one, "one");
  return {
    async decide(requests) {
      const batches = await Promise.all(requests.map((r) => race(one(r), r, timeoutMs, now)));
      const out = {};
      for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        const batch = batches[i];
        if (req === void 0 || batch === void 0) continue;
        out[req.batchId] = batch;
        opts.onBatch?.(batch, req);
      }
      return out;
    }
  };
}
__name(jevProvider, "jevProvider");
function race(work, req, timeoutMs, now) {
  const started = now();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        ...baselineBatch(req, 0),
        latencyMs: Math.max(0, now() - started),
        fallbackReason: "timeout"
      });
    }, timeoutMs + 50);
    void work.then((batch) => {
      clearTimeout(timer);
      resolve(batch);
    });
  });
}
__name(race, "race");
function subjectFor(req, id, answers) {
  const drive = answers[`drive_${id}`] ?? answers[`target_${id}`];
  const fearAnswer = answers[`fear_${id}`];
  const mine = {};
  for (const [name, value] of Object.entries(answers)) {
    if (name.endsWith(`_${id}`)) mine[name.slice(0, name.length - id.length - 1)] = value;
  }
  if (!isChoice(drive)) {
    const fallback = baselineBatch(req, 0).subjects.find((s) => s.agentId === id);
    if (fallback) return fallback;
  }
  const probabilities = isChoice(drive) ? drive.probabilities : { explore: 1 };
  const weights = weightsFrom(probabilities);
  const confidence = isChoice(drive) ? drive.confidence : 0;
  const intent = isChoice(drive) ? drive.choice : "explore";
  const fear = isScore(fearAnswer) ? FEAR_FROM_SCORE(fearAnswer.score, FEAR_LEVELS) : "unconcerned";
  return {
    agentId: id,
    // Read back from what was offered, so the recorded subject says what this
    // agent could have chosen without repeating the wording of the question.
    options: Object.keys(probabilities),
    state: req.state[id] ?? {},
    answers: mine,
    intent,
    lowConfidence: confidence < 0.5,
    fear,
    weights
  };
}
__name(subjectFor, "subjectFor");

// src/batching.ts
var BATCH_SECONDS = 60;
function batchSize(speed, totalTicks, currentTick) {
  const remaining = totalTicks - currentTick;
  if (remaining <= 0) return 0;
  const byTime = speed > 0 ? Math.max(1, Math.round(speed * BATCH_SECONDS)) : CHUNK_TICKS;
  return Math.min(CHUNK_TICKS, byTime, remaining);
}
__name(batchSize, "batchSize");

// src/jev.ts
function httpClient(env) {
  const baseURL = env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai";
  const model = env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest";
  const key = env.TYPESAFE_API_KEY ?? "";
  return {
    async systemOne(request, options) {
      const response = await fetch(`${baseURL}/v1/systemone`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, ...request }),
        ...options?.signal ? { signal: options.signal } : {}
      });
      if (!response.ok) {
        throw new Error(`decision service answered ${String(response.status)}`);
      }
      return await response.json();
    }
  };
}
__name(httpClient, "httpClient");

// src/run-do.ts
var LOG_TAIL = 400;
var blank = /* @__PURE__ */ __name(() => ({ peak: 0, min: 0, current: 0 }), "blank");
var isOver = /* @__PURE__ */ __name((s) => s === "completed" || s === "failed" || s === "cancelled", "isOver");
var RunDO = class {
  static {
    __name(this, "RunDO");
  }
  #state;
  #env;
  constructor(state, env) {
    this.#state = state;
    this.#env = env;
  }
  // ---- storage -------------------------------------------------------------
  async #get(key) {
    return await this.#state.storage.get(key);
  }
  async #put(key, value) {
    await this.#state.storage.put(key, value);
  }
  // ---- viewers -------------------------------------------------------------
  /**
   * Hibernatable, so the object can sleep between batches with sockets still
   * attached. A plain socket would pin it awake for the life of the run.
   */
  #publish(message) {
    const text = JSON.stringify(message);
    for (const ws of this.#state.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
      }
    }
  }
  async webSocketMessage(_ws, raw2) {
    let msg;
    try {
      msg = JSON.parse(String(raw2));
    } catch {
      return;
    }
    if (msg.t === "control" && typeof msg.action === "string") {
      await this.#control(msg.action);
    }
    if (msg.t === "speed" && typeof msg.speed === "number") {
      await this.#setSpeed(msg.speed);
    }
  }
  webSocketClose() {
  }
  webSocketError() {
  }
  // ---- control -------------------------------------------------------------
  async #control(action) {
    const summary = await this.#get("summary");
    const control = await this.#get("control");
    if (!summary || !control || isOver(summary.status)) return;
    const next = { ...control, seq: control.seq + 1 };
    if (action === "pause") {
      next.desired = "pause";
      summary.status = "paused";
    } else if (action === "resume") {
      next.desired = "run";
      summary.status = "running";
    } else if (action === "step") {
      next.desired = "step";
    } else if (action === "stop") {
      next.desired = "stop";
      summary.status = "cancelled";
    } else return;
    await this.#put("control", next);
    await this.#put("summary", summary);
    this.#publish({ t: "status", run: summary });
    await this.#state.storage.setAlarm(Date.now() + 100);
  }
  async #setSpeed(speed) {
    const summary = await this.#get("summary");
    const control = await this.#get("control");
    if (!summary || !control) return;
    const clamped = Math.max(SPEED.slowest, Math.min(SPEED.fastest, Math.round(speed)));
    summary.speed = clamped;
    await this.#put("summary", summary);
    await this.#put("control", { ...control, speed: clamped, seq: control.seq + 1 });
    this.#publish({ t: "status", run: summary });
  }
  // ---- the budget ----------------------------------------------------------
  /** Tell the list page this run exists, or that it has moved on. */
  async #announce(summary) {
    try {
      await this.#env.REGISTRY.get(this.#env.REGISTRY.idFromName("global")).fetch("https://registry/put", { method: "POST", body: JSON.stringify(summary) });
    } catch {
    }
  }
  #budget() {
    return this.#env.BUDGET.get(this.#env.BUDGET.idFromName("global"));
  }
  async #allowanceFor(decider) {
    if (decider === "rules" || !this.#env.TYPESAFE_API_KEY) {
      return { tokens: 0, degraded: true, reason: "disabled" };
    }
    try {
      const r = await this.#budget().fetch("https://budget/grant");
      return await r.json();
    } catch {
      return { tokens: 0, degraded: true, reason: "global_budget" };
    }
  }
  async #recordUsage(used) {
    if (used.requests === 0 && used.inputTokens === 0) return;
    try {
      await this.#budget().fetch("https://budget/record", {
        method: "POST",
        body: JSON.stringify(used)
      });
    } catch {
    }
  }
  // ---- advancing -----------------------------------------------------------
  async alarm() {
    const summary = await this.#get("summary");
    const control = await this.#get("control");
    if (!summary || !control) return;
    if (isOver(summary.status)) return;
    if (control.desired === "pause" && summary.status === "paused") {
      await this.#state.storage.setAlarm(Date.now() + 1e3);
      return;
    }
    const ticks = batchSize(summary.speed, summary.config.ticks, summary.currentTick);
    if (ticks === 0) {
      await this.#finish("completed");
      return;
    }
    const allowance = await this.#allowanceFor(summary.decidedBy);
    const snapshot = await this.#get("snapshot");
    const log = await this.#get("log") ?? [];
    let nextSeq = summary.chunks.length;
    let engineRef = null;
    const usage = { requests: 0, inputTokens: 0 };
    const ackNow = /* @__PURE__ */ __name(() => ({
      control: { desired: control.desired, speed: summary.speed, seq: control.seq },
      allowance,
      rate: { requestsPerMinute: 600 },
      presigned: {
        chunk: `runs/${summary.id}/chunks/${String(nextSeq)}.json.gz`,
        summary: `runs/${summary.id}/summary/${String(nextSeq)}.json.gz`,
        snapshot: `runs/${summary.id}/snapshot.json.gz`,
        expiresAt: new Date(Date.now() + 36e5).toISOString()
      }
    }), "ackNow");
    const coordinator = {
      ready: /* @__PURE__ */ __name(() => Promise.resolve(ackNow()), "ready"),
      chunk: /* @__PURE__ */ __name(async (report) => {
        summary.chunks.push({
          seq: report.seq,
          firstTick: report.firstTick,
          lastTick: report.lastTick,
          bytesGzip: report.bytesGzip
        });
        summary.totals = report.totals;
        summary.currentTick = report.totals.currentTick;
        summary.population = report.totals.population;
        nextSeq = report.seq + 1;
        usage.requests += report.usage.requests;
        usage.inputTokens += report.usage.inputTokens;
        this.#publish({ t: "status", run: summary });
        return ackNow();
      }, "chunk"),
      frames: /* @__PURE__ */ __name((frames, entries) => {
        for (const frame of frames) {
          summary.currentTick = frame.tick;
          this.#publish({ t: "frame", frame });
        }
        if (frames.length > 0) void this.#put("lastFrame", frames[frames.length - 1]);
        if (entries.length > 0) {
          log.push(...entries);
          if (log.length > LOG_TAIL) log.splice(0, log.length - LOG_TAIL);
          this.#publish({ t: "log", entries });
        }
        return Promise.resolve();
      }, "frames"),
      done: /* @__PURE__ */ __name(async (d) => {
        summary.currentTick = d.finalTick;
        summary.totals = d.totals;
        summary.population = d.totals.population;
        summary.endReason = d.reason;
      }, "done"),
      failed: /* @__PURE__ */ __name(async (f) => {
        summary.status = "failed";
        summary.error = f.reason;
      }, "failed")
    };
    const sim = createSimulation({
      runId: summary.id,
      config: summary.config,
      seed: summary.seed,
      coordinator,
      upload: /* @__PURE__ */ __name(async (key, body) => {
        await this.#env.RECORDS.put(key, body);
      }, "upload"),
      provider: /* @__PURE__ */ __name((a) => this.#providerFor(summary.decidedBy, a), "provider"),
      onEngine: /* @__PURE__ */ __name((e) => {
        engineRef = e;
      }, "onEngine")
    });
    let finished = false;
    try {
      const out = await sim.start({
        ...snapshot ? { snapshot } : {},
        // Carried over, or the run would report the population extremes and
        // the Jev usage of this batch alone.
        ...snapshot ? { totals: summary.totals } : {},
        until: summary.currentTick + ticks
      });
      finished = out.finished;
      summary.currentTick = out.tick;
    } catch (err) {
      summary.status = "failed";
      summary.error = err instanceof Error ? err.message : String(err);
      finished = true;
    }
    if (engineRef !== null) {
      await this.#put("snapshot", engineRef.serialize());
    }
    await this.#put("log", log);
    await this.#recordUsage(usage);
    if (summary.status === "failed") {
      await this.#put("summary", summary);
      await this.#announce(summary);
      this.#publish({ t: "status", run: summary });
      return;
    }
    if (control.desired === "stop") {
      await this.#finishWith(summary, "cancelled");
      return;
    }
    if (finished) {
      await this.#finishWith(summary, "completed");
      return;
    }
    if (control.desired === "step") {
      summary.status = "paused";
      await this.#put("control", { ...control, desired: "pause", seq: control.seq + 1 });
    }
    await this.#put("summary", summary);
    await this.#announce(summary);
    this.#publish({ t: "status", run: summary });
    await this.#state.storage.setAlarm(Date.now() + 1);
  }
  #providerFor(decider, allowance) {
    if (decider === "rules" || allowance.degraded || !this.#env.TYPESAFE_API_KEY) {
      return baselineProvider();
    }
    return jevProvider(httpClient(this.#env));
  }
  async #finish(status) {
    const summary = await this.#get("summary");
    if (summary) await this.#finishWith(summary, status);
  }
  async #finishWith(summary, status) {
    summary.status = status;
    summary.queuePosition = null;
    await this.#put("summary", summary);
    await this.#announce(summary);
    this.#publish({ t: "status", run: summary });
  }
  // ---- requests ------------------------------------------------------------
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/start") {
      const body = await request.json();
      const errors = validateConfig(body.config);
      if (errors.length > 0) return Response.json({ errors }, { status: 400 });
      if (await this.#get("summary")) {
        return Response.json({ error: "this run already exists" }, { status: 409 });
      }
      const summary = {
        id: body.id,
        status: "running",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        seed: body.seed,
        config: body.config,
        currentTick: 0,
        queuePosition: null,
        chunks: [],
        totals: {
          currentTick: 0,
          requests: 0,
          inputTokens: 0,
          fallbackCount: 0,
          population: { mice: blank(), cats: blank() }
        },
        error: null,
        decidedBy: body.decider,
        speed: Math.max(
          SPEED.slowest,
          Math.min(SPEED.fastest, Math.round(body.speed ?? SPEED.slowest))
        ),
        population: { mice: blank(), cats: blank() },
        endReason: null
      };
      await this.#put("summary", summary);
      await this.#announce(summary);
      await this.#put("control", { desired: "run", speed: summary.speed, seq: 0 });
      await this.#put("log", []);
      await this.#state.storage.setAlarm(Date.now() + 1);
      return Response.json({ run: summary }, { status: 201 });
    }
    if (path === "/state") {
      const summary = await this.#get("summary");
      if (!summary) return Response.json({ error: "no such run" }, { status: 404 });
      return Response.json({ run: summary });
    }
    if (path === "/control" && request.method === "POST") {
      const { action } = await request.json();
      await this.#control(action);
      const summary = await this.#get("summary");
      return Response.json({ run: summary });
    }
    if (path === "/speed" && request.method === "POST") {
      const { speed } = await request.json();
      await this.#setSpeed(speed);
      return Response.json({ run: await this.#get("summary") });
    }
    if (path === "/stream") {
      if (request.headers.get("upgrade") !== "websocket") {
        return new Response("expected a websocket", { status: 426 });
      }
      const summary = await this.#get("summary");
      if (!summary) return new Response("no such run", { status: 404 });
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.#state.acceptWebSocket(server);
      server.send(JSON.stringify({
        t: "hello",
        run: summary,
        frame: await this.#get("lastFrame") ?? null,
        log: await this.#get("log") ?? []
      }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("no such route", { status: 404 });
  }
};

// src/budget.ts
var emptyDay = /* @__PURE__ */ __name((day) => ({
  day,
  requests: 0,
  inputTokens: 0
}), "emptyDay");
var dayOf = /* @__PURE__ */ __name((at2) => at2.toISOString().slice(0, 10), "dayOf");
function ceilingsFor(o) {
  const tokens = o.pricePerMillionTokens > 0 ? Math.floor(o.dailyBudgetUsd / o.pricePerMillionTokens * 1e6) : 0;
  return {
    dailyTokens: Math.max(0, tokens),
    dailyRequests: o.dailyRequests ?? Math.max(0, Math.floor(tokens / 2e3))
  };
}
__name(ceilingsFor, "ceilingsFor");
function grant(spent, ceilings, today) {
  const used = spent.day === today ? spent : emptyDay(today);
  const tokensLeft = ceilings.dailyTokens - used.inputTokens;
  const requestsLeft = ceilings.dailyRequests - used.requests;
  if (tokensLeft <= 0 || requestsLeft <= 0) {
    return { tokens: 0, degraded: true, reason: "global_budget" };
  }
  return { tokens: tokensLeft, degraded: false };
}
__name(grant, "grant");
function record(spent, used, today) {
  const base = spent.day === today ? spent : emptyDay(today);
  return {
    day: today,
    requests: base.requests + used.requests,
    inputTokens: base.inputTokens + used.inputTokens
  };
}
__name(record, "record");

// src/env.ts
var numberFrom = /* @__PURE__ */ __name((v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}, "numberFrom");

// src/budget-do.ts
var KEY = "spend";
var BudgetDO = class {
  static {
    __name(this, "BudgetDO");
  }
  #storage;
  #env;
  constructor(state, env) {
    this.#storage = state.storage;
    this.#env = env;
  }
  #ceilings() {
    return ceilingsFor({
      dailyBudgetUsd: numberFrom(this.#env.JEV_DAILY_BUDGET_USD, 20),
      // An assumption until the real figure is confirmed: the requirements put
      // a run at about $0.20 per thousand ticks, and a tick measured about 700
      // to 1,900 input tokens.
      pricePerMillionTokens: numberFrom(this.#env.JEV_PRICE_PER_MTOK, 0.28)
    });
  }
  async #spend() {
    return await this.#storage.get(KEY) ?? emptyDay(dayOf(/* @__PURE__ */ new Date()));
  }
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const today = dayOf(/* @__PURE__ */ new Date());
    const spent = await this.#spend();
    if (pathname === "/grant") {
      return Response.json(grant(spent, this.#ceilings(), today));
    }
    if (pathname === "/record") {
      const used = await request.json();
      const after = record(spent, used, today);
      await this.#storage.put(KEY, after);
      return Response.json(after);
    }
    if (pathname === "/state") {
      return Response.json({
        spent: spent.day === today ? spent : emptyDay(today),
        ceilings: this.#ceilings()
      });
    }
    return new Response("no such route", { status: 404 });
  }
};

// src/registry-do.ts
var KEEP = 200;
var KEY2 = "runs";
var RegistryDO = class {
  static {
    __name(this, "RegistryDO");
  }
  #storage;
  constructor(state) {
    this.#storage = state.storage;
  }
  async #list() {
    return await this.#storage.get(KEY2) ?? [];
  }
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/list") {
      return Response.json({ runs: await this.#list() });
    }
    if (pathname === "/put") {
      const run = await request.json();
      const runs = await this.#list();
      const at2 = runs.findIndex((r) => r.id === run.id);
      if (at2 === -1) runs.unshift(run);
      else runs[at2] = run;
      while (runs.length > KEEP) {
        const victim = [...runs].reverse().find((r) => r.status === "completed" || r.status === "failed" || r.status === "cancelled");
        if (!victim) break;
        runs.splice(runs.indexOf(victim), 1);
      }
      await this.#storage.put(KEY2, runs);
      return Response.json({ ok: true });
    }
    return new Response("no such route", { status: 404 });
  }
};

// src/index.ts
var PRESETS2 = ["small", "medium", "large"];
var app = new Hono2();
var runStub = /* @__PURE__ */ __name((env, id) => env.RUN.get(env.RUN.idFromName(id)), "runStub");
var registry = /* @__PURE__ */ __name((env) => env.REGISTRY.get(env.REGISTRY.idFromName("global")), "registry");
app.get("/api/capabilities", (c) => c.json({
  // Whether a key exists, never the key. The page decides what to offer from
  // this and learns nothing else.
  jevAvailable: Boolean(c.env.TYPESAFE_API_KEY),
  speed: { slowest: SPEED.slowest, fastest: SPEED.fastest }
}));
app.get("/api/config/defaults", (c) => {
  const preset = c.req.query("preset") ?? "medium";
  if (!PRESETS2.includes(preset)) {
    return c.json({ error: "unknown preset" }, 400);
  }
  return c.json({ config: defaultConfig(preset) });
});
app.get("/api/runs", async (c) => {
  const r = await registry(c.env).fetch("https://registry/list");
  return c.json(await r.json());
});
app.post("/api/runs", async (c) => {
  const body = await c.req.json();
  if (!body.config) return c.json({ error: "a configuration is required" }, 400);
  const errors = validateConfig(body.config);
  if (errors.length > 0) return c.json({ errors }, 400);
  if (body.decider !== void 0 && body.decider !== "jev" && body.decider !== "rules") {
    return c.json({ error: "decider must be jev or rules" }, 400);
  }
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : Math.floor(Math.random() * 2 ** 31);
  const id = crypto.randomUUID();
  const r = await runStub(c.env, id).fetch("https://run/start", {
    method: "POST",
    body: JSON.stringify({
      id,
      config: body.config,
      seed,
      decider: body.decider ?? "jev",
      ...body.speed === void 0 ? {} : { speed: body.speed }
    })
  });
  return new Response(r.body, { status: r.status, headers: r.headers });
});
app.get("/api/runs/:id", async (c) => {
  const r = await runStub(c.env, c.req.param("id")).fetch("https://run/state");
  return new Response(r.body, { status: r.status, headers: r.headers });
});
app.post("/api/runs/:id/control", async (c) => {
  const r = await runStub(c.env, c.req.param("id")).fetch("https://run/control", {
    method: "POST",
    body: JSON.stringify(await c.req.json())
  });
  return new Response(r.body, { status: r.status, headers: r.headers });
});
app.post("/api/runs/:id/speed", async (c) => {
  const r = await runStub(c.env, c.req.param("id")).fetch("https://run/speed", {
    method: "POST",
    body: JSON.stringify(await c.req.json())
  });
  return new Response(r.body, { status: r.status, headers: r.headers });
});
app.get("/api/runs/:id/stream", (c) => {
  if (c.req.header("upgrade") !== "websocket") {
    return c.text("expected a websocket", 426);
  }
  return runStub(c.env, c.req.param("id")).fetch(
    new Request("https://run/stream", c.req.raw)
  );
});
var object = /* @__PURE__ */ __name(async (c, key) => {
  const got = await c.env.RECORDS.get(key);
  if (!got) return new Response("no such object", { status: 404 });
  return new Response(got.body, {
    headers: {
      "content-type": "application/gzip",
      "cache-control": "private, max-age=31536000, immutable"
    }
  });
}, "object");
app.get("/api/runs/:id/chunks/:seq", (c) => object(c, `runs/${c.req.param("id")}/chunks/${c.req.param("seq")}.json.gz`));
app.get("/api/runs/:id/summary/:seq", (c) => object(c, `runs/${c.req.param("id")}/summary/${c.req.param("seq")}.json.gz`));
app.all("/api/*", (c) => c.json({ error: "no such route" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
var src_default = app;

// ../../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-nPNgne/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-nPNgne/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  BudgetDO,
  RegistryDO,
  RunDO,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
