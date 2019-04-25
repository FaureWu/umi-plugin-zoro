import { readFileSync } from "fs";
import { join, dirname, basename, extname } from "path";
import globby from "globby";
import uniq from "lodash.uniq";
import isRoot from "path-is-root";
import { chunkName, findJS, optsToArray, endWithSlash } from "umi-utils";

export function getModel(cwd, api) {
  const { config, winPath } = api;

  const modelJSPath = findJS(cwd, "model");
  if (modelJSPath) {
    return [winPath(modelJSPath)];
  }

  return globby
    .sync(`./${config.singular ? "model" : "models"}/**/*.{ts,tsx,js,jsx}`, {
      cwd
    })
    .filter(
      p =>
        !p.endsWith(".d.ts") &&
        !p.endsWith(".test.js") &&
        !p.endsWith(".test.jsx") &&
        !p.endsWith(".test.ts") &&
        !p.endsWith(".test.tsx")
    )
    .map(p => api.winPath(join(cwd, p)));
}

function getModelsWithRoutes(routes, api) {
  const { paths } = api;
  return routes.reduce((memo, route) => {
    return [
      ...memo,
      ...(route.component && route.component.indexOf("() =>") !== 0
        ? getPageModels(join(paths.cwd, route.component), api)
        : []),
      ...(route.routes ? getModelsWithRoutes(route.routes, api) : [])
    ];
  }, []);
}

function getPageModels(cwd, api) {
  let models = [];
  while (!isSrcPath(cwd, api) && !isRoot(cwd)) {
    cwd = dirname(cwd);
    models = models.concat(getModel(cwd, api));
  }
  return models;
}

function isSrcPath(path, api) {
  const { paths, winPath } = api;
  return (
    endWithSlash(winPath(path)) === endWithSlash(winPath(paths.absSrcPath))
  );
}

export function getGlobalModels(api, shouldImportDynamic) {
  const { paths, routes } = api;
  let models = getModel(paths.absSrcPath, api);
  if (!shouldImportDynamic) {
    // 不做按需加载时，还需要额外载入 page 路由的 models 文件
    models = [...models, ...getModelsWithRoutes(routes, api)];
    // 去重
    models = uniq(models);
  }
  return models;
}

export default function(api, opts = {}) {
  const { paths, cwd, compatDirname, winPath } = api;
  const isDev = process.env.NODE_ENV === "development";
  const shouldImportDynamic = opts.dynamicImport;

  const zoroDir = compatDirname(
    "@opcjs/zoro/package.json",
    cwd,
    dirname(require.resolve("@opcjs/zoro/package.json"))
  );
  const zoroVersion = require(join(zoroDir, "package.json")).version;

  function getModelName(model) {
    const modelArr = winPath(model).split("/");
    return modelArr[modelArr.length - 1];
  }

  function exclude(models, excludes) {
    return models.filter(model => {
      for (const exclude of excludes) {
        if (typeof exclude === "function" && exclude(getModelName(model))) {
          return false;
        }
        if (exclude instanceof RegExp && exclude.test(getModelName(model))) {
          return false;
        }
      }
      return true;
    });
  }

  function getGlobalModelContent() {
    const models = exclude(
      getGlobalModels(api, shouldImportDynamic),
      optsToArray(opts.exclude)
    ).map(path =>
      `{ namespace: '${basename(
        path,
        extname(path)
      )}', ...(require('${path}').default) }`.trim()
    );

    return `app.model([${models.join(",")}])\r\n`;
  }

  function getPluginContent() {
    const plugins = globby
      .sync("plugins/**/*.{js,ts}", {
        cwd: paths.absSrcPath
      })
      .map(path => `require('../../${path}').default`.trim());

    return `app.use([${plugins.join(",")}])\r\n`;
  }

  function generateZoroContainer() {
    const tpl = join(__dirname, "../template/Container.js");
    const tplContent = readFileSync(tpl, "utf-8");
    api.writeTmpFile("ZoroContainer.js", tplContent);
  }

  function generateInitZoro() {
    const tpl = join(__dirname, "../template/zoro.js");
    let tplContent = readFileSync(tpl, "utf-8");
    tplContent = tplContent
      .replace("<%= EnhanceApp %>", "")
      .replace("<%= RegisterPlugins %>", getPluginContent())
      .replace("<%= RegisterModels %>", getGlobalModelContent());
    api.writeTmpFile("initZoro.js", tplContent);
  }

  api.onGenerateFiles(() => {
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
    api.modifyRouteComponent((memo, args) => {
      const { importPath, webpackChunkName } = args;
      if (!webpackChunkName) {
        return memo;
      }

      let loadingOpts = "";
      if (opts.dynamicImport.loadingComponent) {
        loadingOpts = `LoadingComponent: require('${winPath(
          join(paths.absSrcPath, opts.dynamicImport.loadingComponent)
        )}').default,`;
      }

      let extendStr = "";
      if (opts.dynamicImport.webpackChunkName) {
        extendStr = `/* webpackChunkName: ^${webpackChunkName}^ */`;
      }
      let ret = `_dynamic({
        <%= MODELS %>
        component: () => import(${extendStr}'${importPath}'),
        ${loadingOpts}
      })`.trim();
      const models = getPageModels(join(paths.absTmpDirPath, importPath), api);
      if (models && models.length) {
        ret = ret.replace(
          "<%= MODELS %>",
          `
            app: window.g_app,
            models: () => [
              ${models
                .map(
                  model =>
                    `import(${
                      opts.dynamicImport.webpackChunkName
                        ? `/* webpackChunkName: '${chunkName(paths.cwd, model)}' */`
                        : ""
                    }'${model}').then(m => { return { namespace: '${basename(
                      model,
                      extname(model)
                    )}',...m.default}})`
                )
                .join(",\r\n  ")}
            ],
        `.trim()
        );
      }
      return ret.replace("<%= MODELS %>", "");
    });
  }

  api.addVersionInfo([
    `@opcjs/zoro@${zoroVersion} (${zoroDir})`,
    `path-to-regexp@${require("path-to-regexp/package").version}`
  ]);

  api.modifyAFWebpackOpts(memo => {
    const alias = {
      ...memo.alias,
      "@opcjs/zoro": zoroDir,
      "path-to-regexp": require.resolve("path-to-regexp"),
      "object-assign": require.resolve("object-assign"),
      "react-redux": require.resolve("react-redux"),
    };
    const extraBabelPlugins = [...(memo.extraBabelPlugins || [])];
    return {
      ...memo,
      alias,
      extraBabelPlugins
    };
  });

  api.addPageWatcher([
    join(paths.absSrcPath, "models"),
    join(paths.absSrcPath, "plugins"),
    join(paths.absSrcPath, "model.js"),
    join(paths.absSrcPath, "model.jsx"),
    join(paths.absSrcPath, "model.ts"),
    join(paths.absSrcPath, "model.tsx"),
    join(paths.absSrcPath, "zoro.js"),
    join(paths.absSrcPath, "zoro.jsx"),
    join(paths.absSrcPath, "zoro.ts"),
    join(paths.absSrcPath, "zoro.tsx")
  ]);

  // api.registerGenerator('zoro:model', {
  //   Generator: require('./model').default(api),
  //   resolved: join(__dirname, './model'),
  // });

  api.addRuntimePlugin(join(__dirname, "./runtime"));
  api.addRuntimePluginKey("zoro");

  api.addEntryCodeAhead(
    `require('@tmp/initZoro');`.trim()
  );
}
