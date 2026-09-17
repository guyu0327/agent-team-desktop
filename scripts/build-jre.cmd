@echo off
REM 从 agent-team-server 的 fat jar 裁剪最小 JRE 到 resources/jre/win（Windows 版，macOS 用 build-jre.sh）
REM 用法: 在仓库根目录运行 scripts\build-jre.cmd（后端 jar 优先取源码仓库构建产物，回落本项目已同步的产物）
REM 模块集 = jdeps 静态依赖 + Spring Boot/Tomcat/JPA 反射所需补充集(经实机启动验证，与 build-jre.sh 保持一致)

setlocal
set SERVER_JAR_SOURCE=..\agent-team-server\target\agent-team-server-0.0.1-SNAPSHOT.jar
set SERVER_JAR_SYNCED=resources\server\agent-team-server.jar
set SERVER_JAR=%SERVER_JAR_SOURCE%
if not exist "%SERVER_JAR_SOURCE%" set SERVER_JAR=%SERVER_JAR_SYNCED%
if not exist "%SERVER_JAR%" (
  echo [ERROR] 未找到后端 jar: %SERVER_JAR_SOURCE% 或 %SERVER_JAR_SYNCED%
  echo         请先在 agent-team-server 执行: mvnw -DskipTests package
  exit /b 1
)

echo [1/2] jdeps 分析模块依赖 (%SERVER_JAR%)...
for /f "delims=" %%i in ('jdeps --ignore-missing-deps --print-module-deps --multi-release 21 "%SERVER_JAR%" 2^>nul ^| findstr /r "java\."') do set JDepsModules=%%i
if not defined JDepsModules (
  echo [ERROR] jdeps 未能分析出模块依赖
  exit /b 1
)
echo 静态依赖: %JDepsModules%

set EXTRAS=java.compiler,java.datatransfer,java.desktop,java.instrument,java.management,java.naming,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql.rowset,java.transaction.xa,java.xml.crypto,jdk.crypto.cryptoki,jdk.crypto.ec,jdk.unsupported,jdk.zipfs

echo [2/2] jlink 生成 JRE...
if exist resources\jre\win rmdir /s /q resources\jre\win
jlink --add-modules %JDepsModules%,%EXTRAS% --strip-debug --no-header-files --no-man-pages --compress=zip-6 --output resources\jre\win
if errorlevel 1 (
  echo [ERROR] jlink 失败
  exit /b 1
)

echo 完成: resources\jre\win
for /f "delims=" %%i in ('powershell -Command "(Get-ChildItem -Recurse resources\jre\win | Measure-Object Length -Sum).Sum / 1MB"') do echo 大小约 %%i MB
endlocal
