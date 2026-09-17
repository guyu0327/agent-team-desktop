#!/usr/bin/env bash
# 从 agent-team-server 的 fat jar 裁剪最小 JRE 到 resources/jre/mac（macOS 版，Windows 用 build-jre.cmd）
# 用法: 在仓库根目录运行 scripts/build-jre.sh（后端 jar 优先取源码仓库构建产物，回落本项目已同步的产物）
# 模块集 = jdeps 静态依赖 + Spring Boot/Tomcat/JPA 反射所需补充集(经实机启动验证，与 build-jre.cmd 保持一致)

set -euo pipefail

# jdeps/jlink 不在 PATH 时回落 JAVA_HOME（macOS 的 /usr/bin 只有 java stub）
if ! command -v jlink >/dev/null 2>&1; then
  JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home)}"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

SERVER_JAR_SOURCE=../agent-team-server/target/agent-team-server-0.0.1-SNAPSHOT.jar
SERVER_JAR_SYNCED=resources/server/agent-team-server.jar
if [[ -f "$SERVER_JAR_SOURCE" ]]; then
  SERVER_JAR="$SERVER_JAR_SOURCE"
elif [[ -f "$SERVER_JAR_SYNCED" ]]; then
  SERVER_JAR="$SERVER_JAR_SYNCED"
else
  echo "[ERROR] 未找到后端 jar: $SERVER_JAR_SOURCE 或 $SERVER_JAR_SYNCED" >&2
  exit 1
fi

echo "[1/2] jdeps 分析模块依赖 ($SERVER_JAR)..."
JDepsModules=$(jdeps --ignore-missing-deps --print-module-deps --multi-release 21 "$SERVER_JAR" 2>/dev/null | grep 'java\.' | head -1)
if [[ -z "$JDepsModules" ]]; then
  echo "[ERROR] jdeps 未能分析出模块依赖" >&2
  exit 1
fi
echo "静态依赖: $JDepsModules"

# 与 build-jre.cmd 完全一致的反射补充集
EXTRAS="java.compiler,java.datatransfer,java.desktop,java.instrument,java.management,java.naming,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql.rowset,java.transaction.xa,java.xml.crypto,jdk.crypto.cryptoki,jdk.crypto.ec,jdk.unsupported,jdk.zipfs"

echo "[2/2] jlink 生成 JRE..."
rm -rf resources/jre/mac
jlink --add-modules "$JDepsModules,$EXTRAS" --strip-debug --no-header-files --no-man-pages --compress=zip-6 --output resources/jre/mac

echo "完成: resources/jre/mac ($(du -sh resources/jre/mac | cut -f1))"
