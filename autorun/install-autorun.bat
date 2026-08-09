@echo off
REM ============================================
REM Windows Controller - Install Windows Autorun
REM Registers the server to start at login
REM ============================================
setlocal enabledelayedexpansion

echo ============================================
echo  Windows Controller - Install Autorun
echo ============================================
echo.

REM Get the project root (parent of this script's folder)
for %%I in ("%~dp0..") do set "PROJECT_DIR=%%~fI"
set "VBS_SOURCE=%~dp0start-hidden.vbs"

REM Startup folder shortcut name
set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WindowsController.lnk"
set "VBS_DEST=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\WindowsController.vbs"

echo [1/3] Copying startup script to Startup folder...
copy /Y "%VBS_SOURCE%" "%VBS_DEST%" >nul
if errorlevel 1 (
  echo   FAILED to copy VBS script.
  pause
  exit /b 1
)
echo   OK - %VBS_DEST%

echo [2/3] Creating shortcut in Startup folder...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_DEST%\"'; $s.WorkingDirectory = '%PROJECT_DIR%'; $s.Description = 'Windows Controller Server'; $s.Save()"
if errorlevel 1 (
  echo   FAILED to create shortcut.
  pause
  exit /b 1
)
echo   OK - %SHORTCUT_PATH%

echo [3/3] Testing the VBS script...
cscript //nologo "%VBS_DEST%"
echo   Started server (verify at http://localhost:3003)

echo.
echo ============================================
echo  Autorun installed successfully!
echo  The server will start automatically at login.
echo  To remove: delete the WindowsController files
echo  from the Startup folder.
echo ============================================
pause