@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ==========================================================
REM Compartilhamento rápido (fora da rede local)
REM - Sobe backend/frontend em janelas separadas
REM - Abre 2 túneis Cloudflare (3000 e 5173)
REM - Captura URLs trycloudflare automaticamente
REM - Atualiza mvp-fluxo-frontend\.env com VITE_API_URL
REM ==========================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "BACKEND_DIR=%ROOT%\mvp-fluxo-backend"
set "FRONTEND_DIR=%ROOT%\mvp-fluxo-frontend"

if not exist "%BACKEND_DIR%" (
  echo [ERRO] Pasta backend nao encontrada: %BACKEND_DIR%
  exit /b 1
)

if not exist "%FRONTEND_DIR%" (
  echo [ERRO] Pasta frontend nao encontrada: %FRONTEND_DIR%
  exit /b 1
)

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo [ERRO] cloudflared nao encontrado no PATH.
  echo Instale com: winget install --id Cloudflare.cloudflared
  exit /b 1
)

set "LOG_DIR=%TEMP%\projetoferramenta-share"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
set "BACKEND_LOG=%LOG_DIR%\backend-tunnel.log"
set "FRONTEND_LOG=%LOG_DIR%\frontend-tunnel.log"
if exist "%BACKEND_LOG%" del /f /q "%BACKEND_LOG%" >nul 2>&1
if exist "%FRONTEND_LOG%" del /f /q "%FRONTEND_LOG%" >nul 2>&1

echo.
echo [1/6] Subindo backend (janela separada) com CORS aberto para compartilhamento...
start "Backend Dev (3000)" cmd /k "cd /d \"%BACKEND_DIR%\" && set CORS_ORIGIN=* && npm run dev"
timeout /t 4 >nul

echo [2/6] Abrindo tunnel do backend (3000)...
start "Tunnel Backend (3000)" powershell -NoExit -ExecutionPolicy Bypass -Command ^
  "cloudflared tunnel --url http://localhost:3000 2>&1 | Tee-Object -FilePath '%BACKEND_LOG%'"

echo.
echo Aguardando URL publica do backend...
set "BACKEND_URL="
for /L %%i in (1,1,90) do (
  for /f "usebackq delims=" %%u in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%BACKEND_LOG%'; if(Test-Path $p){$m=Select-String -Path $p -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' | Select-Object -First 1; if($m){$m.Matches[0].Value}}"`) do (
    set "BACKEND_URL=%%u"
  )
  if defined BACKEND_URL goto :got_backend_url
  timeout /t 1 >nul
)

echo [ERRO] Nao consegui capturar URL do tunnel backend.
echo Abra a janela "Tunnel Backend (3000)" e copie a URL trycloudflare.
exit /b 1

:got_backend_url
echo URL Backend: !BACKEND_URL!

echo [3/6] Atualizando .env do frontend com VITE_API_URL...
(
  echo VITE_API_URL=!BACKEND_URL!
) > "%FRONTEND_DIR%\.env"

echo [4/6] Subindo frontend (janela separada)...
start "Frontend Dev (5173)" cmd /k "cd /d \"%FRONTEND_DIR%\" && npm run dev"
timeout /t 4 >nul

echo [5/6] Abrindo tunnel do frontend (5173)...
start "Tunnel Frontend (5173)" powershell -NoExit -ExecutionPolicy Bypass -Command ^
  "cloudflared tunnel --url http://localhost:5173 2>&1 | Tee-Object -FilePath '%FRONTEND_LOG%'"

echo.
echo Aguardando URL publica do frontend...
set "FRONTEND_URL="
for /L %%i in (1,1,90) do (
  for /f "usebackq delims=" %%u in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%FRONTEND_LOG%'; if(Test-Path $p){$m=Select-String -Path $p -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' | Select-Object -First 1; if($m){$m.Matches[0].Value}}"`) do (
    set "FRONTEND_URL=%%u"
  )
  if defined FRONTEND_URL goto :got_frontend_url
  timeout /t 1 >nul
)

echo [ERRO] Nao consegui capturar URL do tunnel frontend.
echo Abra a janela "Tunnel Frontend (5173)" e copie a URL trycloudflare.
exit /b 1

:got_frontend_url
echo URL Frontend: !FRONTEND_URL!
echo [6/6] Pronto.
echo.
echo ==========================================================
echo Compartilhamento pronto.
echo.
echo Acesse de outra maquina:
echo   !FRONTEND_URL!
echo.
echo API publica:
echo   !BACKEND_URL!
echo ==========================================================
echo.
echo Para voltar ao ambiente local:
echo   mvp-fluxo-backend\.env  -> CORS_ORIGIN=http://localhost:5173
echo   mvp-fluxo-frontend\.env -> VITE_API_URL=http://localhost:3000
echo.
echo Mantenha as 4 janelas abertas:
echo - Backend Dev (3000)
echo - Frontend Dev (5173)
echo - Tunnel Backend (3000)
echo - Tunnel Frontend (5173)
echo.
pause

endlocal
