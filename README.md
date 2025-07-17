# reccli-ts

reccli-ts 是一个基于 TypeScript 的 USTC Rec 云盘服务的命令行界面（CLI）实现。该项目由学长的 [reccli](https://github.com/taoky/reccli) 项目改编而来，原项目使用 Python 编写。reccli-ts 对该项目进行了重写和扩展，增加了对 **群组云盘访问**、**文件夹上传下载**、**多线程上传下载** 等功能的支持。

## 特点

- **群组云盘访问**：reccli-ts 支持群组云盘的访问和管理，允许用户在群组中进行文件操作，同时遵循 USTC Rec 云盘的权限管理规则。
- **文件夹上传下载**：reccli-ts 支持文件夹的上传和下载，用户可以方便地直接上传和下载整个文件夹，而不需要手动一个一个文件地操作。
- **快速上传**：相比于原有的网页端需要提前计算 md5，并且仅支持串行上传，reccli-ts 则直接通过并行上传的方式跑满带宽，极大地提高了上传速度。
  - 实测在 Windows 11 系统，千兆有线校园网下，传输单个约 38GB 的大文件时，使用 reccli-ts 上传时间仅有**不到 8 分钟**，而使用 Rec 网页端上传则需要**超过 43 分钟**，其中计算 md5 的时间就占据了 **11 分钟左右**。
  - 使用 reccli-ts 上传时，网络速率几乎可以跑满带宽，而 Rec 网页端上传时，网络速率仅有最多不到 50% 的带宽占用率，具体对比如下图所示（来源 Windows 11 任务管理器）：
- **Seafile 新云盘访问**：为适应旧的 Rec 云盘向新的 Seafile 云盘的迁移，在 v1.5.0 版本后，reccli-ts 支持访问新的云盘服务，用户可以使用非常方便的办法从 Rec 云盘迁移到新的 Seafile 云盘上去。

![优化前网络速率](docs/before.png)  
![优化后网络速率](docs/after.png)  
<p align="center">图1：文件上传网络速率对比（上：Rec 网页端，下：reccli-ts）</p>

## 安装

### 使用 npm 安装

```bash
npm install -g reccli-ts
```

### 从源代码安装

```bash
git clone https://github.com/Vertsineu/reccli-ts.git
cd reccli-ts
npm install
npm run build && npm run start
```

## 用法

首先通过以下指令登录

```bash
reccli-ts login -d
```

其中 `-d` 选项表示默认以该用户登录，如果不指定，则接下来的运行阶段需要通过 `-a` 选项指定学号。

登录成功后，您可以使用以下命令运行 reccli-ts，并进入到交互式命令行界面：

```bash
reccli-ts run
```

reccli-ts 提供了一些可用的简单指令，可以通过以下命令查看帮助信息：

```bash
help [command]
```

比如

```bash
help download
```

在 v1.5.0 后，新增 Seafile 网盘访问功能，需要在 pan.ustc.edu.cn 中开启 WebDav 并使用以下指令登录：

```bash
reccli-ts webdav-login -d
```

由于设计问题，新网盘和旧网盘的目录结构不好合并成一个，因此在使用 reccli-ts 时，同一个 CLI 实例会通过两套指令分别操作旧网盘和新网盘。

比如 `ls` `cd` 等指令仍用于在 Rec 网盘上操作，而 `lsw` `cdw` 等指令则用于在 Seafile 网盘上操作，两者唯一的区别就是后缀的 `w`，表示 WebDav。

CLI 的 Prompt 将两个网盘的当前目录分开显示，比如 `/cloud/[/share]>` 表示在 Rec 网盘的 `/cloud` 目录下，同时在 Seafile 网盘的 `/share` 目录下。

## 结构

reccli-ts 的根目录由以下几个次根目录组成：

- `cloud`：用户个人云盘根目录
- `recycle`：用户个人云盘回收站
- `backup`：用户个人云盘备份目录
- `group`：用户所在群组根目录

需要注意的是，只有 `save` 指令才能从 `group` 文件夹下保存文件或文件夹到 `cloud` 文件夹下，其他文件操作指令只能在**同一个**组或者个人云盘内操作，如果非要实现，必须先 `download`，再 `upload` 才能实现。

在 v1.5.0 版本后，reccli-ts 支持访问新的 Seafile 云盘服务，其架构只有存储库概念，扁平化存放在根目录下，因此不过多说明。

## 例子

如果你想要将整个个人云盘以文件夹的形式直接下载下来，你可以使用以下指令：

```bash
reccli-ts run -c "download /cloud ."
```

这条指令会将整个个人云盘下载为当前目录下的 `cloud` 文件夹。

但是，由于权限问题，如果想要将某个群组云盘以文件夹的形式下载下来，你必须将有下载权限的根目录一个一个下载下来：

```bash
reccli-ts run -c "download /group/{group_name} ."
```

将 `{group_name}` 替换为实际的群组名，这条指令会将根目录下载为当前目录下的 `{group_name}` 文件夹。

其中 `{group_name}` 需要您手动 `ls` 看一下，记得空格是需要用 `\` 转义的。

在 v1.5.0 版本后，如果你想要将 Rec 网盘的个人资料迁移到 Seafile 网盘，可以使用以下指令：

```bash
reccli-ts run -c "transfer /cloud /{database}" "unwrapw /{database}/cloud"
```

其中 `{database}` 是您自己创建的 Seafile 资料库名称。

如果你想要将 Rec 网盘的群组资料迁移到 Seafile 网盘，可以使用以下指令：

```bash
reccli-ts run -c "transfer /group/{group_name} /{database}" "unwrapw /{database}/{group_name}"
```

其中 `{group_name}` 是您要迁移的群组名，`{database}` 是您自己创建的群组的 Seafile 资料库名称，需要您手动 `lsw` 看一下，记得所有参数中的空格是需要用 `\` 转义的。

## 注意事项

- 由于 Rec API 的限制，部分指令的语义和在 Linux Shell 中的有所不同，其中一个最大的差异就是 `mv`，`cp`，`download` 等指令的最后一个参数，即目标路径，必须指向一个文件夹，即这些指令只能把源文件或文件夹放在目标文件夹下，不能**同时**指定操作后的文件或文件夹名，因此您需要保证目标文件夹下不要有**同名文件**或**同名文件夹**。

- 在使用 reccli-ts 中的指令指定文件路径时，路径分隔符请使用 `/`，而不是 Windows 下的 `\`，因为 reccli-ts 是基于 Node.js 的跨平台实现，路径分隔符统一使用 `/`。

## License

This project continues to be licensed under the MIT License, and the original MIT License terms from the `reccli` project apply to the original codebase.
