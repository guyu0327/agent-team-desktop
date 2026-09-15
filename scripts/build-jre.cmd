@echo off
REM 从 agent-team-server 的 fat jar 裁剪最小 JRE 到 resources/jre
REM 用法: 先构建后端 jar, 然后在仓库根目录运行 scripts\build-jre.cmd
REM 模块集 = jdeps 静态依赖 + Spring Boot/Tomcat/JPA 反射所需补充集(经实机启动验证)

setlocal
set SERVER_JAR=..\agent-team-server\target\agent-team-server-0.0.1-SNAPSHOT.jar
if not exist "%SERVER_JAR%" (
  echo [ERROR] 未找到后端 jar, 请先在 agent-team-server 执行: mvnw -DskipTests package
  exit /b 1
)

echo [1/2] jdeps 分析模块依赖...
for /f "delims=" %%i in ('jdeps --ignore-missing-deps --print-module-deps --multi-release 21 "%SERVER_JAR%" 2^>nul ^| findstr /r "java\."') do set JDepsModules=%%i
echo 静态依赖: %JDepsModules%

set EXTRAS=java.compiler,java.datatransfer,java.desktop,java.instrument,java.management,java.naming,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql.rowset,java.transaction.xa,java.xml.crypto,jdk.crypto.cryptoki,jdk.crypto.ec,jdk.unsupported,jdk.zipfs

echo [2/2] jlink 生成 JRE...
if exist resources\jre rmdir /s /q resources\jre
jlink --add-modules %JDepsModules%,%EXTRAS% --strip-debug --no-header-files --no-man-pages --compress=zip-6 --output resources\jre
if errorlevel 1 (
  echo [ERROR] jlink 失败
  exit /b 1
)

echo 完成: resources\jre
for /f "delims=" %%i in ('powershell -Command "(Get-ChildItem -Recurse resources\jre | Measure-Object Length -Sum).Sum / 1MB"') do echo 大小约 %%i MB
endlocal
