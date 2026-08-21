# Client 模块

[English](client-modules.md) | 中文

Client 插件表：[dsh-client-modules](../../packages/client/modules) 中 client 模块系统的 Node 半，以 `ctx.clientModules`（`ClientModuleRegistry`）形式提供。它扫描宿主 Loader 的 entry，找出声明了 `dsh.client` 的包，组合出 `window.__DSH_BOOT__` entry 图，解析 bundle 路径，并用完整的浏览器启动协议转换应用 index。它是 Web 与 Desktop GUI 栈的一项可选能力，不属于 agent loop（智能体循环）主干。[dsh-host-webserver](../../packages/host/webserver) 存在时，本服务注册 [web-server.md](web-server.md) 所述的 bundle 路由与 index 转换；Desktop 则通过自己的特权协议载体读取相同的 bundle 路径和 index 转换。同一个包的浏览器半（`ctx.modules`，即拉取并物化这些 bundle 的 lazy CJS 模块表）属于内核机件，记录在[包 README](../../packages/client/modules/README.md)中，不在本页。

源码：[`packages/client/modules/src/client/manifest.ts`](../../packages/client/modules/src/client/manifest.ts)

## wire

图是 Node 半与浏览器半之间协议层的唯一真源：宿主从扫描到的包组合出 `WebBootEntry` 行，`injectBootManifest()` 会依次安装队列模式的 `window.__ModuleLoader__` facade、阻塞式 modules 与 runtime bundle 预加载项，以及 `window.__DSH_BOOT__`，然后 shell 模块才运行。图的 JSON 会转义 `<`，插件可控的字符串因此无法逃出 script 元素。缺失 facade、自举 bundle 或有效 manifest 的页面无法启动；每个缺失或畸形输入都会在自己的所属阶段大声抛错。

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch; `inject` is informational graph
 * metadata (the authoritative edges live in each package's `dsh.client`
 * declaration and reach fibers through entry creation). `external` carries
 * module-graph edges: unlike `inject`, they constrain code arrival because
 * `require` is synchronous (see {@link WebBootGraph.entries}).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /** Bundle endpoint, '/plugins/<id>/client.js?rev=<rev>'. */
  url: string
  /** Bundle content hash (cache-busting consistency anchor). */
  rev: string
  /** Package-name dependency edges, informational (preflight display / HMR diffing). */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
  /** Non-baseline module specifiers this row requests; omitted when it requests none. */
  external?: string[]
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the whole graph (content + bundle hashes). */
  rev: string
  /**
   * Composed entries in module-graph order — a dynamic package row precedes
   * rows whose `external` requests that package. Cordis activation order is
   * unrelated and remains owned by fiber service waiting.
   */
  entries: WebBootEntry[]
}
```

每一行的 `rev` 是该 bundle 的内容哈希，并作为使缓存失效的查询参数附在 URL 上；图的 `rev` 对组合后的各行做哈希，因此任何一行的变化都会改变它。`immediately` 标记第一阶段预取档位（在模块面启动期间 fetch 并执行，只做登记）；惰性行在首次 import 时才拉取。

## 扫描

包加入这张表的方式，是在自己的 package.json 中声明 `dsh.client`（`platform: 'web'`、可选的 `inject` 边、可选的 `immediately`），并在 `exports["./client"]` 导出构建好的 bundle。包解析锚定在配置树的 `ctx.baseUrl`——即 cordis.yml 所在目录，该目录的包把每个被组合的插件声明为依赖——这一锚点未设置时，构造即抛错。

扫描是单包增量的；不存在全量重扫代码路径。fiber 构造或 dispose（资源释放）时的每次 cordis `internal/plugin` 发射都把该 fiber 的 entry 名标脏，一次微任务 flush 把每个脏名与实时 loader entry 对账。激活趟以全部当前 entry 灌入同一个脏集合并同步 flush，因此初扫与稳态共享一条实现——但失败姿态相反。激活时，已加载 entry 中的畸形声明或缺失 bundle 会聚合为一个大声的 `AggregateError`，列出每个损坏的包：该 fiber 进入 FAILED，由启动的大声失败 sweep 上报。稳态下，损坏的包只记录一条警告，且不得殃及其他包。

包元数据——包括「非 client 包」这一否定结论——按名缓存且永不过期：插件集合的变更在重启后生效。fiber 重启原样复用其行与 rev；bundle 内容变更只经 `rebuilt()` 到达图。

## bundle 提供与 index 转换

Web 载体的 `GET`/`HEAD /plugins/<id>/client.js` 路由以 `no-cache` 从磁盘提供已注册的 bundle（锚定一致性的是 rev 查询参数，而非 HTTP 缓存）；其他方法返回 405。未知 id——或已注册、但 bundle 因尚未构建而不可读的行——回应一个大声的 404，而不是让载体的 SPA 回退把 HTML 当作 JavaScript 发出。它的 index 转换会在每次 index 渲染时调用 `injectBootManifest()`。Desktop 载体读取 `clientPath(id)`，并在提供 dist index 前调用同一转换，因此两个载体都针对当前组合启动，并保持完全一致的 facade、预加载项和图顺序。

## 服务

`ClientModuleRegistry`（`ctx.clientModules`，定义于 [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)）暴露读取面、index 转换与重建面；签名见生成的[服务目录](#ctxclientmodules--clientmoduleregistry)。`graph()` 返回当前组合出的图（两次变更之间是同一个稳定对象），`clientPath(id)` 返回该 bundle 的绝对路径，`injectBootManifest(html)` 则用该图及其所需自举脚本转换应用 index。`rebuilt(id)` 是 bundle 内容到达图的唯一入口：它对文件重新哈希，只有 rev 真正变化才会重新组合图并发出通知。`onRebuilt` 按发生变化的 bundle 逐个触发并携带新 rev；`onGraphChanged` 在任何一次重新组合了图的 flush 之后触发（行的增删，或 rebuilt 带来的 rev 变化），并采用拉取模型——监听器自行重读 `graph()`。两条通知路径都会兜住监听器异常，因此一个抛错的订阅者既不能让后续订阅者被跳过，也不能杀死触发这次 flush 的一方。

开发环境下，[dsh-client-hmr](../../packages/client/hmr/README.md) 是注册表的监视驱动：它的 Node 半从同步取得的基线出发，对图中每一行的 bundle 做 stat 轮询，变化时调用 `rebuilt(id)`，经 `onGraphChanged` 重新同步监视集合，并通过 SSE（Server-Sent Events）把 rev 变化广播给浏览器半。生产环境的图完全不含 HMR（热模块替换）行；模块宿主自身从不监视文件。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

The web plugin table service: incremental `dsh.client` scan + wire composition + bundle route + index tap. Construction runs the activation scan synchronously — a malformed declaration or missing bundle among the already-loaded entries aggregates into one loud throw (FAILED fiber; the boot activation audit reports it).

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__DSH_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Install the module-loader facade, parser preloads, and current graph into
 * an application index. HTTP and desktop carriers share this exact boot protocol.
 * @param html - application index source.
 * @returns the transformed index.
 */
injectBootManifest(html: string): string

/**
 * Absolute path of an entry's client bundle.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Re-hash one bundle (the HMR watch's registration hook — the only entry
 * point through which bundle content changes reach the graph).
 * @param id - entry id (package name).
 * @returns the new rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires only when the re-hash changed the rev.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source: [`packages/client/modules/src/index.ts:295`](../../packages/client/modules/src/index.ts)
<!-- END GENERATED cordis-surface -->
