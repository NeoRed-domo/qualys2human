@echo off
setlocal enableextensions
title Qualys2Human Installer
echo.
echo ================================================
echo   Qualys2Human - Installation
echo   NeoRed (c) 2026
echo ================================================
echo.

:: Check admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Ce script doit etre execute en tant qu'administrateur.
    echo Faites un clic droit ^> Executer en tant qu'administrateur.
    pause
    exit /b 1
)

:: Find Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python n'est pas installe ou n'est pas dans le PATH.
    echo Installez Python 3.12+ depuis le dossier prerequisites\.
    pause
    exit /b 1
)

:: Run the setup script
echo Lancement de l'installateur...
echo.
python "%~dp0setup.py" %*

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] L'installation a echoue. Consultez les messages ci-dessus.
    pause
    exit /b 1
)

echo.
echo Installation terminee avec succes.
pause
