# 从官方 bundle 重放构建

只依赖 Python 3 标准库；以下命令在工程根目录运行。若 `python` 不在 PATH，请使用指定运行时的完整路径。

```text
python scripts/build.py --emit
python scripts/build.py --check
python scripts/build.py
```

- `--emit`：仅在直接修改现有 `lib/client.js`、需要把改动冻结到源码片段时运行。只读产物，覆盖 `src/` 的五个片段，不读取 asar。首次建立片段已执行；平时修改片段后不要再执行它，否则会被旧产物覆盖。
- `--check`：只在内存中构建，比较现有 `lib/client.js`，不会写文件。完全一致输出 `CHECK PASS`；不同输出首个差异的零基字节偏移及两侧各前后 80 字节上下文（Python bytes 表示法），退出码 1。
- 无参数：从 `D:\dsh\resources\app.asar` 读取官方 bundle，保留前导字节与六段官方代码，以 `src/` 五段替换其余五段，最后全局改包名，覆盖生成 `lib/client.js`、`lib/index.js` 和 `package.json`。后两者的完整字节模板内联在脚本中。

片段包含 region 标记、原缩进和换行；最后的 `index-region.js` 还包括 bundle 尾部包装及 sourceMappingURL。不要格式化或规范化换行。脚本检查完整 bundle 的 11 段数量、各 label 唯一性及顺序，并检查片段只有一个正确的 region。

构建与检查均打印实际读取的官方 bundle 字节数及 SHA256。当前基线：79,594 字节，SHA256 `45c51652151c98b6c1a560c05dbb8ab43ddb7b6de97e8eb8751d7a10a6a15f21`。未来升级 DSH 后应核对该值；脚本不会锁死哈希，结构兼容不代表升级后仍能逐字节复现旧产物。

语法检查（使用本机 Node 路径或 PATH 中的 node）：

```text
node --check lib/client.js
```

脚本不安装依赖、不启停 DSH、不修改 profile 配置；语法与字节检查不替代 UI 功能测试。
