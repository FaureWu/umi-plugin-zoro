import zoro from '@opcjs/zoro';

const runtime = window.g_plugins.mergeConfig('zoro');
let app = zoro({
  ...(runtime.config || {}),
});
<%= EnhanceApp %>
window.g_app = app;
app.use(runtime.plugins || [])
<%= RegisterPlugins %>
<%= RegisterModels %>
app.intercept = runtime.intercept || {}