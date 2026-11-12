@echo off
rem FlightScope launcher: (re)starts the local data relay in the background and opens the map.
rem   FlightScope.cmd shortcut   instead puts a FlightScope shortcut with the radar icon on the desktop.
setlocal
set "DIR=%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist "%DIR%flightscope.html" (
  echo flightscope.html was not found next to this launcher. The map page must stay in the same folder as flightscope-server.js.
  pause
  exit /b 1
)
if /i "%~1"=="shortcut" goto shortcut
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*flightscope-server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Start-Sleep -Milliseconds 400;" ^
  "Start-Process -FilePath 'node' -ArgumentList ('\"' + $env:DIR + 'flightscope-server.js\"') -WorkingDirectory $env:DIR -WindowStyle Hidden;" ^
  "Start-Sleep -Milliseconds 1500;" ^
  "Start-Process 'http://localhost:8787/'"
endlocal
exit /b 0

:shortcut
rem The icon is drawn by the relay (the same radar scope the page and the app use); build it once if it is missing.
if not exist "%DIR%FlightScope.ico" node "%DIR%flightscope-server.js" --build-icon
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'FlightScope.lnk';" ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk);" ^
  "$s.TargetPath = $env:DIR + 'FlightScope.cmd'; $s.WorkingDirectory = $env:DIR; $s.IconLocation = $env:DIR + 'FlightScope.ico,0';" ^
  "$s.Description = 'FlightScope - live flight radar'; $s.WindowStyle = 7; $s.Save(); Write-Host ('Desktop shortcut created: ' + $lnk)"
pause
endlocal
exit /b 0
