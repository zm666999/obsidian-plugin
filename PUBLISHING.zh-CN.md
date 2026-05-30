# 发布指南

这份指南适用于当前工程：Community Plugin Detail Translator。

## 一、发布前确认

当前已确定的信息：

- 作者名：zmsun
- 版本号：0.1.0
- 插件目录：`community-plugin-detail-translator`

你还需要在正式发布前确认一项：

- `manifest.json` 里的 `authorUrl`

建议在 GitHub 仓库创建完成后，把它改成你的 GitHub 主页或插件仓库地址。

## 二、先发布到 GitHub

### 1. 创建 GitHub 仓库

建议仓库名直接使用：

`community-plugin-detail-translator`

创建公开仓库后，把当前目录作为仓库根目录。

### 2. 初始化并提交代码

在当前插件目录执行：

```powershell
git init
git add .
git commit -m "Initial release v0.1.0"
git branch -M main
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

示例仓库地址格式：

```text
https://github.com/<your-account>/community-plugin-detail-translator.git
```

### 3. 更新 authorUrl

推送仓库后，建议把下面文件中的 `authorUrl` 改成你的 GitHub 主页地址或仓库地址：

- `manifest.json`

例如：

```json
"authorUrl": "https://github.com/zmsun"
```

改完后重新提交：

```powershell
git add manifest.json
git commit -m "Set author URL"
git push
```

## 三、创建 GitHub Release

Obsidian 社区插件安装时，真正下载的是 GitHub Release 附件，而不是仓库里的源码文件。

### 1. 构建发布文件

在当前目录执行：

```powershell
npm install
npm run verify
```

### 2. 确认需要上传的附件

发布时上传这 3 个文件：

- `main.js`
- `manifest.json`
- `styles.css`

### 3. 创建 tag 和 release

版本现在是 `0.1.0`，所以 GitHub release tag 也必须是：

`0.1.0`

你可以在 GitHub 网页端创建 release，也可以本地打 tag：

```powershell
git tag 0.1.0
git push origin 0.1.0
```

然后去 GitHub 仓库页面创建 Release：

- Tag: `0.1.0`
- Release title: `v0.1.0`
- Attach binaries:
  - `main.js`
  - `manifest.json`
  - `styles.css`

## 四、提交到 Obsidian 社区插件市场

官方提交流程核心是：

1. 登录 `https://community.obsidian.md`
2. 绑定 GitHub 账号
3. 打开 `Plugins -> New plugin`
4. 提交你的 GitHub 仓库地址
5. 等待自动审查结果

### 提交前再次检查

确认仓库默认分支根目录至少有这些文件：

- `README.md`
- `LICENSE`
- `manifest.json`
- `versions.json`

确认 GitHub Release 附件里有：

- `main.js`
- `manifest.json`
- `styles.css`

### 重要规则

- 社区目录读取的是默认分支根目录上的 `README.md` 和 `manifest.json`
- 实际安装下载的是 GitHub Release 附件
- Release 的 tag 必须和 `manifest.json` 里的 `version` 完全一致
- 插件 id 必须唯一，且不能包含 `obsidian`

## 五、建议发布顺序

1. 检查 `manifest.json`、`README.md`、`LICENSE`
2. 执行 `npm run verify`
3. 提交代码到 GitHub
4. 创建 `0.1.0` release
5. 上传 `main.js`、`manifest.json`、`styles.css`
6. 去 Obsidian 社区提交仓库地址

## 六、你现在最需要做的两件事

1. 创建 GitHub 仓库并把当前目录推上去
2. 把 `manifest.json` 的 `authorUrl` 改成你的 GitHub 地址后，再创建 `0.1.0` release
