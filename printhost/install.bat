@echo off
setlocal

set "SRC=%~dp0printhost.exe"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "DEST=%STARTUP%\printhost.exe"

if not exist "%SRC%" (
  echo FOUT: printhost.exe niet gevonden naast install.bat.
  pause
  exit /b 1
)

echo Installeren...
copy /Y "%SRC%" "%DEST%" >nul
if errorlevel 1 (
  echo FOUT: kopieren naar de opstartmap is mislukt.
  pause
  exit /b 1
)

echo Programma gestart...
start "" "%DEST%"

echo.
echo Klaar. Het printprogramma is geinstalleerd en draait nu.
echo Het start voortaan automatisch mee bij het opstarten van deze computer.
echo Dit venster mag je sluiten.
pause
