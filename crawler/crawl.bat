@echo off
rem IdeaOS 爬虫一键抓取：双击即可，无需记命令。
rem 输入关键词抓 HN/Reddit/V2EX；直接回车则跑 config.ts 里的监控列表。
chcp 65001 >nul
cd /d "%~dp0"

set "kw="
set /p "kw=输入要抓的关键词（直接回车=跑监控列表）: "

if "%kw%"=="" (
  echo 跑监控列表（config.ts 的 WATCHLIST）…
  call npm run watchlist
) else (
  echo 抓取「%kw%」…
  call npm run crawl -- --source all --query "%kw%"
)

echo.
echo 完成。打开 IdeaOS 发现页的"外部待审"，挑相关的提升为观察。
pause
