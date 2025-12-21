@echo off
del /f /q main.py
del /f /q config.py
del /f /q requirements.txt
rmdir /s /q cogs
rmdir /s /q utils
rmdir /s /q views
echo Done
