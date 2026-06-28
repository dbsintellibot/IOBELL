@echo off
echo ========================================================
echo      AutoBell: Fixing Audio Library Conflicts
echo ========================================================
echo.
echo This script will remove the old/incompatible 'ESP32-audioI2S' library
echo from your OneDrive Documents folder. This is necessary to allow
echo the Arduino Library Manager to install the correct version.
echo.
echo Target 1: C:\Users\sufya\OneDrive\Documents\Arduino\libraries\ESP32-audioI2S-master
echo Target 2: C:\Users\sufya\OneDrive\Documents\Arduino\libraries\ESP32-audioI2S
echo.

if exist "C:\Users\sufya\OneDrive\Documents\Arduino\libraries\ESP32-audioI2S-master" (
    echo Removing Target 1...
    rmdir /s /q "C:\Users\sufya\OneDrive\Documents\Arduino\libraries\ESP32-audioI2S-master"
    echo Done.
) else (
    echo Target 1 not found (OK).
)

if exist "C:\Users\sufya\OneDrive\Documents\Arduino\libraries\ESP32-audioI2S" (
    echo Removing Target 2...
    rmdir /s /q "C:\Users\sufya\OneDrive\Documents\Arduino\libraries\ESP32-audioI2S"
    echo Done.
) else (
    echo Target 2 not found (OK).
)

echo.
echo ========================================================
echo                 NEXT STEPS
echo ========================================================
echo 1. Open Arduino IDE.
echo 2. Go to Sketch -> Include Library -> Manage Libraries.
echo 3. Search for "ESP32-audioI2S".
echo 4. Install the version by "Schreibfaul1" (v3.0.0 or later).
echo 5. Go back to main_s3.cpp and UNCOMMENT the line:
echo    audio->setBufsize(16000, 32000);
echo 6. Upload the code.
echo.
pause
