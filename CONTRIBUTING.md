# 参与贡献 / Contributing

感谢你愿意改进 LookHome。这是一个**完全开源**的项目（MIT 协议），任何人都可以 fork、修改、私有部署或二次发布商用版本。

## 一、本地跑起来

```bash
# 服务端（Node.js ≥ 18，推荐 20 LTS）
git clone https://github.com/hlt7511163/lookhome.git
cd lookhome
npm install
JWT_SECRET="$(openssl rand -hex 32)" npm start
# 默认 http://127.0.0.1:3001
```

- 数据库：SQLite，首次启动自动在 `data/lookhome.db` 建表（`server/schema.sql`）。
- 后台默认管理员：见 `server/db.js` 里的初始化逻辑；本地调试可 `node reset-password.js admin 新密码`。
- 前端后台：`cd web && npm install && npm run dev`（Vite，默认 5173，代理到 3001）。
- 小程序：用微信开发者工具导入 `middleware/` 目录，改 `middleware/config.js` 里的 `BASE_URL` 指向你的域名。

## 二、目录结构

```
server/          服务端（Express + better-sqlite3，ESM）
  middleware/    鉴权 auth.js、登录失败锁定 loginGuard.js、审计 audit.js、安全头 securityHeaders.js
  routes/        按业务域拆分的路由（auth / tenants / bills / contracts / pay / refunds …）
  lib/           合同模板、邮件、对象存储等
  db.js          连接 + 幂等迁移
  schema.sql     全量建表语句
web/             后台前端（Vue3 + Vite）
middleware/      微信小程序端源码（租客端 + 管理端）
docs/            设计文档
```

## 三、提交改动

1. Fork 本仓库，从 `main` 切出分支：`git checkout -b feat/your-feature`。
2. 改动尽量**小而有界**：一个 PR 只做一件事，避免格式化整个文件造成的巨型 diff。
3. 提交信息用 Conventional Commits：`feat: 新增押金分期`、`fix: 修复退房后房源状态未更新`、`docs:`、`refactor:`、`chore:`。
4. 提交 PR 时请说明：**改了什么、为什么改、怎么验证的**（附 curl 或界面截图即可）。

### 数据库改动

本项目**不用迁移框架**，迁移写在 `server/db.js` 的 `initDb()` 里，必须幂等：

```js
const cols = db.prepare('PRAGMA table_info(tenants)').all().map(c => c.name);
if (!cols.includes('new_col')) db.exec('ALTER TABLE tenants ADD COLUMN new_col TEXT');
```

同时把新表/新列同步写进 `server/schema.sql`（新装用户直接建好）。

### 安全相关改动

以下属于**红线**，改动请在 PR 里单独说明并附验证方式：

- 任何涉及身份证号、手机号、合同金额、支付回调的改动；
- 任何放宽鉴权（`tenantAuth` / `auth` / `adminOnly`）、新增公开接口的改动；
- 任何新增第三方依赖（请说明为什么现有依赖不够用）。

## 四、绝对不要提交

- `data/`（含 `lookhome.db`、上传的证件照）、`*.db`、`node_modules/`、`*.log`；
- `middleware/project.private.config.json`（开发者工具私有配置）；
- 任何密钥：`JWT_SECRET`、微信支付商户私钥、短信/SMTP/对象存储凭据；
- `.bak-*` 备份文件。

`.gitignore` 已覆盖以上大部分路径，提交前请 `git status` 自查一遍。

## 五、行为准则

- 对事不对人，技术讨论保持克制与具体；
- 不提交他人隐私数据用于演示，演示数据请用假姓名 / 假身份证（如 `110101199001011234`）；
- 不接受把本项目改造成灰产工具的 PR。

## 六、协议

提交即表示你同意以 [MIT License](LICENSE) 授权你的贡献。
