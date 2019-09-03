"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getModel = getModel;
exports.getGlobalModels = getGlobalModels;
exports["default"] = _default;

var _fs = require("fs");

var _path = require("path");

var _globby = _interopRequireDefault(require("globby"));

var _lodash = _interopRequireDefault(require("lodash.uniq"));

var _pathIsRoot = _interopRequireDefault(require("path-is-root"));

var _umiUtils = require("umi-utils");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

function getModel(cwd, api) {
  var config = api.config,
      winPath = api.winPath;
  var modelJSPath = (0, _umiUtils.findJS)(cwd, "model");

  if (modelJSPath) {
    return [winPath(modelJSPath)];
  }

  return _globby["default"].sync("./".concat(config.singular ? "model" : "models", "/**/*.{ts,tsx,js,jsx}"), {
    cwd: cwd
  }).filter(function (p) {
    return !p.endsWith(".d.ts") && !p.endsWith(".test.js") && !p.endsWith(".test.jsx") && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx");
  }).map(function (p) {
    return api.winPath((0, _path.join)(cwd, p));
  });
}

function getModelsWithRoutes(routes, api) {
  var paths = api.paths;
  return routes.reduce(function (memo, route) {
    return [].concat(_toConsumableArray(memo), _toConsumableArray(route.component && route.component.indexOf("() =>") !== 0 ? getPageModels((0, _path.join)(paths.cwd, route.component), api) : []), _toConsumableArray(route.routes ? getModelsWithRoutes(route.routes, api) : []));
  }, []);
}

function getPageModels(cwd, api) {
  var models = [];

  while (!isSrcPath(cwd, api) && !(0, _pathIsRoot["default"])(cwd)) {
    cwd = (0, _path.dirname)(cwd);
    models = models.concat(getModel(cwd, api));
  }

  return models;
}

function isSrcPath(path, api) {
  var paths = api.paths,
      winPath = api.winPath;
  return (0, _umiUtils.endWithSlash)(winPath(path)) === (0, _umiUtils.endWithSlash)(winPath(paths.absSrcPath));
}

function getGlobalModels(api, shouldImportDynamic) {
  var paths = api.paths,
      routes = api.routes;
  var models = getModel(paths.absSrcPath, api);

  if (!shouldImportDynamic) {
    // 不做按需加载时，还需要额外载入 page 路由的 models 文件
    models = [].concat(_toConsumableArray(models), _toConsumableArray(getModelsWithRoutes(routes, api))); // 去重

    models = (0, _lodash["default"])(models);
  }

  return models;
}

function _default(api) {
  var opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var paths = api.paths,
      cwd = api.cwd,
      winPath = api.winPath;
  var isDev = process.env.NODE_ENV === "development";
  var shouldImportDynamic = opts.dynamicImport;
  var zoroDir = "".concat(cwd, "/node_modules/@opcjs/zoro");

  var zoroVersion = require((0, _path.join)(zoroDir, "package.json")).version;

  function getModelName(model) {
    var modelArr = winPath(model).split("/");
    return modelArr[modelArr.length - 1];
  }

  function exclude(models, excludes) {
    return models.filter(function (model) {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = excludes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var _exclude = _step.value;

          if (typeof _exclude === "function" && _exclude(getModelName(model))) {
            return false;
          }

          if (_exclude instanceof RegExp && _exclude.test(getModelName(model))) {
            return false;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return true;
    });
  }

  function getGlobalModelContent() {
    var models = exclude(getGlobalModels(api, shouldImportDynamic), (0, _umiUtils.optsToArray)(opts.exclude)).map(function (path) {
      return "{ namespace: '".concat((0, _path.basename)(path, (0, _path.extname)(path)), "', ...(require('").concat(path, "').default) }").trim();
    });
    return "app.model([".concat(models.join(","), "])\r\n");
  }

  function getPluginContent() {
    var plugins = _globby["default"].sync("plugins/**/*.{js,ts}", {
      cwd: paths.absSrcPath
    }).map(function (path) {
      return "require('../../".concat(path, "').default").trim();
    });

    return "app.use([".concat(plugins.join(","), "])\r\n");
  }

  function generateZoroContainer() {
    var tpl = (0, _path.join)(__dirname, "../template/Container.js");
    var tplContent = (0, _fs.readFileSync)(tpl, "utf-8");
    api.writeTmpFile("ZoroContainer.js", tplContent);
  }

  function generateInitZoro() {
    var tpl = (0, _path.join)(__dirname, "../template/zoro.js");
    var tplContent = (0, _fs.readFileSync)(tpl, "utf-8");
    tplContent = tplContent.replace("<%= EnhanceApp %>", "").replace("<%= RegisterPlugins %>", getPluginContent()).replace("<%= RegisterModels %>", getGlobalModelContent());
    api.writeTmpFile("initZoro.js", tplContent);
  }

  api.onGenerateFiles(function () {
    generateZoroContainer();
    generateInitZoro();
  });

  if (shouldImportDynamic) {
    api.addRouterImport({
      source: "./dynamic.js",
      specifier: "_dynamic"
    });
  }

  if (shouldImportDynamic) {
    api.modifyRouteComponent(function (memo, args) {
      var importPath = args.importPath,
          webpackChunkName = args.webpackChunkName;

      if (!webpackChunkName) {
        return memo;
      }

      var loadingOpts = "";

      if (opts.dynamicImport.loadingComponent) {
        loadingOpts = "LoadingComponent: require('".concat(winPath((0, _path.join)(paths.absSrcPath, opts.dynamicImport.loadingComponent)), "').default,");
      }

      var extendStr = "";

      if (opts.dynamicImport.webpackChunkName) {
        extendStr = "/* webpackChunkName: ^".concat(webpackChunkName, "^ */");
      }

      var ret = "_dynamic({\n        <%= MODELS %>\n        component: () => import(".concat(extendStr, "'").concat(importPath, "'),\n        ").concat(loadingOpts, "\n      })").trim();
      var models = getPageModels((0, _path.join)(paths.absTmpDirPath, importPath), api);

      if (models && models.length) {
        ret = ret.replace("<%= MODELS %>", "\n            app: window.g_app,\n            models: () => [\n              ".concat(models.map(function (model) {
          return "import(".concat(opts.dynamicImport.webpackChunkName ? "/* webpackChunkName: '".concat((0, _umiUtils.chunkName)(paths.cwd, model), "' */") : "", "'").concat(model, "').then(m => { return { namespace: '").concat((0, _path.basename)(model, (0, _path.extname)(model)), "',...m.default}})");
        }).join(",\r\n  "), "\n            ],\n        ").trim());
      }

      return ret.replace("<%= MODELS %>", "");
    });
  }

  api.addVersionInfo(["@opcjs/zoro@".concat(zoroVersion, " (").concat(zoroDir, ")"), "path-to-regexp@".concat(require("path-to-regexp/package").version)]);
  api.modifyAFWebpackOpts(function (memo) {
    var alias = _objectSpread({}, memo.alias, {
      "@opcjs/zoro": zoroDir,
      "path-to-regexp": require.resolve("path-to-regexp"),
      "object-assign": require.resolve("object-assign"),
      "react-redux": require.resolve("react-redux")
    });

    var extraBabelPlugins = _toConsumableArray(memo.extraBabelPlugins || []);

    return _objectSpread({}, memo, {
      alias: alias,
      extraBabelPlugins: extraBabelPlugins
    });
  });
  api.addPageWatcher([(0, _path.join)(paths.absSrcPath, "models"), (0, _path.join)(paths.absSrcPath, "plugins"), (0, _path.join)(paths.absSrcPath, "model.js"), (0, _path.join)(paths.absSrcPath, "model.jsx"), (0, _path.join)(paths.absSrcPath, "model.ts"), (0, _path.join)(paths.absSrcPath, "model.tsx"), (0, _path.join)(paths.absSrcPath, "zoro.js"), (0, _path.join)(paths.absSrcPath, "zoro.jsx"), (0, _path.join)(paths.absSrcPath, "zoro.ts"), (0, _path.join)(paths.absSrcPath, "zoro.tsx")]); // api.registerGenerator('zoro:model', {
  //   Generator: require('./model').default(api),
  //   resolved: join(__dirname, './model'),
  // });

  api.addRuntimePlugin((0, _path.join)(__dirname, "./runtime"));
  api.addRuntimePluginKey("zoro");
  api.addEntryCodeAhead("require('@tmp/initZoro');".trim());
}