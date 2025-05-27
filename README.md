# reccli-ts

reccli-ts 是一个基于 TypeScript 的 USTC Rec 云盘服务的命令行界面（CLI）实现。该项目由学长的 [reccli](https://github.com/taoky/reccli) 项目改编而来，原项目使用 Python 编写。reccli-ts 对该项目进行了重写和扩展，增加了对 **群组云盘访问**、**文件夹上传下载**、**多线程上传下载** 等功能的支持。

## 特点

- **群组云盘访问**：reccli-ts 支持群组云盘的访问和管理，允许用户在群组中进行文件操作，同时遵循 USTC Rec 云盘的权限管理规则。
- **文件夹上传下载**：reccli-ts 支持文件夹的上传和下载，用户可以方便地直接上传和下载整个文件夹，而不需要手动一个一个文件地操作。
- **快速上传**：相比于原有的网页端需要提前计算 md5，并且仅支持串行上传，reccli-ts 则直接通过并行上传的方式跑满带宽，极大地提高了上传速度。

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

## Acknowledgements

This project is based on the open-source library [reccli](https://github.com/taoky/reccli), which is licensed under the MIT License. The original repository provides a command-line interface for Rec Cloud Service.

### Modifications

The following modifications were made to the original project:

- The original Python implementation has been re-written in TypeScript for better integration with modern JavaScript/TypeScript environments.
- Added new functionality for **group cloud drive access**, allowing users to manage group-based operations in addition to individual account functionalities.

## License

This project continues to be licensed under the MIT License, and the original MIT License terms from the `reccli` project apply to the original codebase.
