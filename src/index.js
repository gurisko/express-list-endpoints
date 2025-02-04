const regExpToParseExpressPathRegExp = /^\/\^\\\/(?:(:?[\w\\.-]*(?:\\\/:?[\w\\.-]*)*)|(\(\?:\(\[\^\\\/]\+\?\)\)))\\\/.*/
const regExpToReplaceExpressPathRegExpParams = /\(\?:\(\[\^\\\/]\+\?\)\)/
const regexpExpressParamRegexp = /\(\?:\(\[\^\\\/]\+\?\)\)/g

const EXPRESS_ROOT_PATH_REGEXP_VALUE = '/^\\/?(?=\\/|$)/i'
const STACK_ITEM_VALID_NAMES = [
  'router',
  'bound dispatch',
  'mounted_app'
]
const STACK_ITEM_IGNORED_NAMES = [
  'query',
  'expressInit'
]

/**
 * Returns all the verbs detected for the passed route
 */
const getRouteMethods = function (route) {
  let methods = Object.keys(route.methods)

  methods = methods.filter((method) => method !== '_all')
  methods = methods.map((method) => method.toUpperCase())

  return methods
}

/**
 * Returns the names (or anonymous) of all the middlewares attached to the
 * passed route
 * @param {Object} route
 * @returns {string[]}
 */
const getRouteMiddlewares = function (middlewares, route) {
  return middlewares.concat(route.stack.map((item) => {
    return item.handle.name || 'anonymous'
  }))
}

/**
 * Returns true if found regexp related with express params
 * @param {string} expressPathRegExp
 * @returns {boolean}
 */
const hasParams = function (expressPathRegExp) {
  return regexpExpressParamRegexp.test(expressPathRegExp)
}

/**
 * @param {Object} route Express route object to be parsed
 * @param {string} basePath The basePath the route is on
 * @return {Object[]} Endpoints info
 */
const parseExpressRoute = function (route, basePath, middlewares = []) {
  const paths = []

  if (Array.isArray(route.path)) {
    paths.push(...route.path)
  } else {
    paths.push(route.path)
  }

  const endpoints = []
  paths.forEach((path) => {
    const completePath = basePath && path === '/'
      ? basePath
      : `${basePath}${path}`

    getRouteMethods(route).forEach((method) => {
      endpoints.push({
        method,
        path: completePath,
        middlewares: getRouteMiddlewares(middlewares, route)
      })
    })
  })

  return endpoints
}

/**
 * @param {RegExp} expressPathRegExp
 * @param {Object[]} params
 * @returns {string}
 */
const parseExpressPath = function (expressPathRegExp, params) {
  let expressPathRegExpExec = regExpToParseExpressPathRegExp.exec(expressPathRegExp)
  let parsedRegExp = expressPathRegExp.toString()
  let paramIndex = 0

  while (hasParams(parsedRegExp)) {
    const paramName = params[paramIndex].name
    const paramId = `:${paramName}`

    parsedRegExp = parsedRegExp
      .replace(regExpToReplaceExpressPathRegExpParams, paramId)

    paramIndex++
  }

  if (parsedRegExp !== expressPathRegExp.toString()) {
    expressPathRegExpExec = regExpToParseExpressPathRegExp.exec(parsedRegExp)
  }

  const parsedPath = expressPathRegExpExec[1].replace(/\\\//g, '/')

  return parsedPath
}

/**
 * @param {Object} app
 * @param {string} [basePath]
 * @param {Object[]} [endpoints]
 * @returns {Object[]}
 */
const parseEndpoints = function (app, basePath, endpoints) {
  const stack = app.stack || (app._router && app._router.stack)

  endpoints = endpoints || []
  basePath = basePath || ''

  if (!stack) {
    endpoints = addEndpoints(endpoints, [{
      path: basePath,
      method: null,
      middlewares: []
    }])
  } else {
    endpoints = parseStack(stack, basePath, endpoints)
  }

  return endpoints
}

/**
 * Ensures the path of the new endpoints isn't yet in the array.
 * If the path is already in the array merges the endpoints with the existing
 * one, if not, it adds them to the array.
 *
 * @param {Object[]} currentEndpoints Array of current endpoints
 * @param {Object[]} endpointsToAdd New endpoints to be added to the array
 * @returns {Object[]} Updated endpoints array
 */
const addEndpoints = function (currentEndpoints, endpointsToAdd) {
  endpointsToAdd.forEach((newEndpoint) => {
    const existingEndpoint = currentEndpoints.find(
      (item) => item.path === newEndpoint.path && item.method === newEndpoint.method
    )

    if (existingEndpoint !== undefined) {
      existingEndpoint.middlewares = existingEndpoint.middlewares.concat(newEndpoint.middlewares)
    } else {
      currentEndpoints.push(newEndpoint)
    }
  })

  return currentEndpoints
}

/**
 * @param {Object} stack
 * @param {string} basePath
 * @param {Object[]} endpoints
 * @returns {Object[]}
 */
const parseStack = function (stack, basePath, endpoints) {
  const middlewares = []
  stack.forEach((stackItem) => {
    if (stackItem.route) {
      const newEndpoints = parseExpressRoute(stackItem.route, basePath, middlewares)

      endpoints = addEndpoints(endpoints, newEndpoints)
    } else if (STACK_ITEM_VALID_NAMES.includes(stackItem.name)) {
      const isExpressPathRegexp = regExpToParseExpressPathRegExp.test(stackItem.regexp)

      let newBasePath = basePath

      if (isExpressPathRegexp) {
        const parsedPath = parseExpressPath(stackItem.regexp, stackItem.keys, middlewares)

        newBasePath += `/${parsedPath}`
      } else if (!stackItem.path && stackItem.regexp && stackItem.regexp.toString() !== EXPRESS_ROOT_PATH_REGEXP_VALUE) {
        const regExpPath = ` RegExp(${stackItem.regexp}) `

        newBasePath += `/${regExpPath}`
      }

      endpoints = parseEndpoints(stackItem.handle, newBasePath, endpoints)
    } else if (!STACK_ITEM_IGNORED_NAMES.includes(stackItem.name)) {
      middlewares.push(stackItem.handle.name || 'anonymous')
    }
  })

  return endpoints
}

/**
 * Returns an array of strings with all the detected endpoints
 * @param {Object} app the express/route instance to get the endpoints from
 */
const getEndpoints = function (app) {
  const endpoints = parseEndpoints(app)

  return endpoints
}

module.exports = getEndpoints
