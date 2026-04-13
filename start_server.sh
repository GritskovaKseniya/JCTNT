#!/bin/bash

# JCTNT Server Startup Script (Linux/Mac/WSL)

clear
echo "============================================================"
echo " JCTNT Server - Starting..."
echo "============================================================"
echo ""

echo " [1/3] Checking Python..."
if ! command -v python3 &> /dev/null; then
    echo " ERROR: Python not found! Install Python 3.10+"
    exit 1
fi
python3 --version
echo ""

echo " [2/3] Checking dependencies..."
if ! python3 -c "import flask" 2>/dev/null; then
    echo " ERROR: Flask not installed!"
    echo " Run: pip install -r requirements.txt"
    exit 1
fi
echo " OK: All dependencies installed"
echo ""

echo " [3/3] Starting server..."
echo "============================================================"
echo ""
echo " Server running on:"
echo "  - http://localhost:5000"
echo "  - http://127.0.0.1:5000"
echo ""
echo " Press CTRL+C to stop the server"
echo "============================================================"
echo ""

python3 app.py

echo ""
echo "============================================================"
echo " Server stopped."
echo "============================================================"
