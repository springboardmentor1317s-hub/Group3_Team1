@echo off
cd /d "c:\Users\Rohit sahu\Desktop\demoPages\Group3_Team1"

echo ===== Aborting any pending merge =====
git merge --abort 2>nul

echo ===== Discarding all local changes =====
git checkout -- .
git clean -fd

echo ===== Fetching latest from origin =====
git fetch origin

echo ===== Resetting to main branch =====
git checkout main
git reset --hard origin/main

echo ===== Creating fresh branch =====
git checkout -b Rohit-Sahu

echo.
echo ===== DONE! Branch reset to main =====
git log --oneline -5
